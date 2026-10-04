import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { open, rename, stat, unlink } from 'node:fs/promises';
import type { JsonObject, ToolAuthorizationSnapshot, ToolPolicy } from '../../core/src/index.ts';
import { canUseSandboxOperation, isAllowedCommand, isAllowedWorkspacePath, resolveSandboxPath } from './sandbox.ts';

export type ToolRuntimeMode = 'dry_run' | 'fixture' | 'local';
export type ToolRuntimeTool = 'filesystem' | 'shell';
export type ToolRuntimeOperation = 'read' | 'write' | 'shell';

export type ToolExecutionRequest = {
  requestId?: string;
  runId?: string;
  mode: ToolRuntimeMode;
  tool: ToolRuntimeTool;
  operation: ToolRuntimeOperation;
  workspaceRoot: string;
  policy: ToolPolicy;
  path?: string;
  /** UTF-8 content for filesystem.write. Never included in a receipt. */
  content?: string;
  /** Set by the control plane only after a required one-off approval is resolved. */
  approvalGranted?: boolean;
  /** Snapshot checked by the control plane immediately before execution. */
  authorization?: ToolAuthorizationSnapshot;
  argv?: string[];
  maxBytes?: number;
  timeoutMs?: number;
};

export type ToolExecutionReceipt = {
  schemaVersion: 'tool.execution-receipt.v1';
  requestId: string;
  mode: ToolRuntimeMode;
  status: 'dry_run' | 'succeeded' | 'failed';
  tool: ToolRuntimeTool;
  operation: ToolRuntimeOperation;
  inputSha256: string;
  outputSha256?: string;
  durationMs: number;
  errorCode?: string;
  redacted?: boolean;
};

export type ToolExecutionResult = {
  receipt: ToolExecutionReceipt;
  output?: JsonObject;
  invoked: JsonObject;
  completed?: JsonObject;
  failed?: JsonObject;
};

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function failureCode(reason: string): string {
  return `tool_${reason}`;
}

/**
 * Keep the tool/operation pair explicit at the runtime boundary.  The
 * policy guard maps an operation to the corresponding tool, but it cannot
 * detect a malformed request such as `tool=filesystem, operation=shell`.
 * Rejecting that pair before policy evaluation prevents direct callers from
 * accidentally bypassing the intended operation semantics.
 */
function operationMatchesTool(tool: ToolRuntimeTool, operation: ToolRuntimeOperation): boolean {
  return tool === 'filesystem'
    ? operation === 'read' || operation === 'write'
    : operation === 'shell';
}

function authorizationGuard(authorization?: ToolAuthorizationSnapshot): { allowed: boolean; reason?: 'authorization_revoked' | 'authorization_expired' | 'authorization_cancelled' } {
  if (!authorization || authorization.status === 'not_required' || authorization.status === 'approved') return { allowed: true };
  return { allowed: false, reason: authorization.status === 'expired' ? 'authorization_expired' : authorization.status === 'cancelled' ? 'authorization_cancelled' : 'authorization_revoked' };
}

function redactSecrets(value: string): { value: string; redacted: boolean } {
  let redacted = false;
  const patterns: Array<[RegExp, string]> = [
    [/\bsk-[A-Za-z0-9_-]{16,}\b/g, '[REDACTED_API_KEY]'],
    [/(\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\b\s*[:=]\s*["']?)([^\s,"'}]+)/gi, '$1[REDACTED]'],
  ];
  let output = value;
  for (const [pattern, replacement] of patterns) {
    const next = output.replace(pattern, replacement);
    redacted ||= next !== output;
    output = next;
  }
  return { value: output, redacted };
}

function localFailure(
  requestId: string,
  request: ToolExecutionRequest,
  inputSha256: string,
  startedAt: number,
  errorCode: string,
  invoked: JsonObject,
  message: string,
): ToolExecutionResult {
  const receipt: ToolExecutionReceipt = {
    schemaVersion: 'tool.execution-receipt.v1', requestId, mode: request.mode,
    status: 'failed', tool: request.tool, operation: request.operation,
    inputSha256, durationMs: Date.now() - startedAt, errorCode,
  };
  return { receipt, invoked, failed: { ...receipt, message } };
}

function runReadOnlyCommand(argv: string[], cwd: string, timeoutMs: number): Promise<{ exitCode: number | null; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(argv[0], argv.slice(1), { cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, Math.max(100, Math.min(30_000, timeoutMs)));
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk) => { stdout += String(chunk).slice(0, 64_000); });
    child.stderr?.on('data', (chunk) => { stderr += String(chunk).slice(0, 64_000); });
    child.once('error', (error) => {
      clearTimeout(timer);
      resolve({ exitCode: null, stdout, stderr: `${stderr}${error.message}`, timedOut });
    });
    child.once('close', (exitCode) => {
      clearTimeout(timer);
      resolve({ exitCode, stdout, stderr, timedOut });
    });
  });
}

/**
 * A deliberately narrow first ToolRuntime slice. It validates a tool request
 * against the existing policy guards and returns a deterministic fixture or
 * dry-run result. It never reads file contents, writes files, or starts a
 * process; the control plane remains responsible for persisting RunEvents.
 */
export class FixtureToolRuntime {
  private readonly completed = new Map<string, ToolExecutionResult>();

  async execute(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
    const requestId = request.requestId ?? `tool-request-${randomUUID()}`;
    const startedAt = Date.now();
    const input = {
      mode: request.mode,
      tool: request.tool,
      operation: request.operation,
      workspaceRoot: request.workspaceRoot,
      path: request.path ?? null,
      contentSha256: typeof request.content === 'string' ? sha256(request.content) : null,
      argv: request.argv ?? null,
    };
    const inputSha256 = sha256(input);
    const previous = this.completed.get(requestId);
    if (previous) return previous;

    const invoked: JsonObject = {
      requestId,
      runId: request.runId ?? null,
      mode: request.mode,
      tool: request.tool,
      operation: request.operation,
      inputSha256,
      execution: 'fixture_only',
      ...(request.authorization ? { policyVersion: request.authorization.policyVersion, authorizationStatus: request.authorization.status } : {}),
    };

    const authorization = authorizationGuard(request.authorization);
    if (!authorization.allowed) {
      const receipt: ToolExecutionReceipt = {
        schemaVersion: 'tool.execution-receipt.v1', requestId, mode: request.mode,
        status: 'failed', tool: request.tool, operation: request.operation,
        inputSha256, durationMs: Date.now() - startedAt, errorCode: failureCode(authorization.reason ?? 'authorization_revoked'),
      };
      const result = { receipt, invoked, failed: { ...receipt, message: authorization.reason ?? 'authorization_revoked' } };
      this.completed.set(requestId, result);
      return result;
    }

    if (!operationMatchesTool(request.tool, request.operation)) {
      const receipt: ToolExecutionReceipt = {
        schemaVersion: 'tool.execution-receipt.v1', requestId, mode: request.mode,
        status: 'failed', tool: request.tool, operation: request.operation,
        inputSha256, durationMs: Date.now() - startedAt, errorCode: 'tool_operation_mismatch',
      };
      const result = { receipt, invoked, failed: { ...receipt, message: 'tool_operation_mismatch' } };
      this.completed.set(requestId, result);
      return result;
    }

    const operationGuard = canUseSandboxOperation(request.policy, request.operation);
    if (!operationGuard.allowed) {
      const receipt: ToolExecutionReceipt = {
        schemaVersion: 'tool.execution-receipt.v1', requestId, mode: request.mode,
        status: 'failed', tool: request.tool, operation: request.operation,
        inputSha256, durationMs: Date.now() - startedAt, errorCode: failureCode(operationGuard.reason ?? 'denied'),
      };
      const result = { receipt, invoked, failed: { ...receipt, message: operationGuard.reason ?? 'tool_not_allowed' } };
      this.completed.set(requestId, result);
      return result;
    }

    let output: JsonObject;
    if (request.tool === 'filesystem') {
      if (!request.path) {
        const receipt: ToolExecutionReceipt = {
          schemaVersion: 'tool.execution-receipt.v1', requestId, mode: request.mode,
          status: 'failed', tool: request.tool, operation: request.operation,
          inputSha256, durationMs: Date.now() - startedAt, errorCode: 'tool_path_required',
        };
        const result = { receipt, invoked, failed: { ...receipt, message: 'path_required' } };
        this.completed.set(requestId, result);
        return result;
      }
      const resolved = await resolveSandboxPath(request.workspaceRoot, request.path);
      if (!resolved.ok) {
        const receipt: ToolExecutionReceipt = {
          schemaVersion: 'tool.execution-receipt.v1', requestId, mode: request.mode,
          status: 'failed', tool: request.tool, operation: request.operation,
          inputSha256, durationMs: Date.now() - startedAt, errorCode: failureCode(resolved.reason),
        };
        const result = { receipt, invoked, failed: { ...receipt, message: resolved.reason } };
        this.completed.set(requestId, result);
        return result;
      }
      const pathGuard = isAllowedWorkspacePath(resolved.relativePath, request.policy.allowedPaths);
      if (!pathGuard.allowed) {
        const receipt: ToolExecutionReceipt = {
          schemaVersion: 'tool.execution-receipt.v1', requestId, mode: request.mode,
          status: 'failed', tool: request.tool, operation: request.operation,
          inputSha256, durationMs: Date.now() - startedAt, errorCode: failureCode(pathGuard.reason ?? 'path_not_allowlisted'),
        };
        const result = { receipt, invoked, failed: { ...receipt, message: pathGuard.reason ?? 'path_not_allowlisted' } };
        this.completed.set(requestId, result);
        return result;
      }
      output = {
        mode: request.mode,
        planned: true,
        operation: request.operation,
        relativePath: resolved.relativePath,
        ...(request.mode === 'fixture' ? { fixtureContent: `fixture:${resolved.relativePath}` } : {}),
      };
    } else {
      const command = isAllowedCommand(request.argv ?? [], request.policy);
      if (!command.allowed) {
        const receipt: ToolExecutionReceipt = {
          schemaVersion: 'tool.execution-receipt.v1', requestId, mode: request.mode,
          status: 'failed', tool: request.tool, operation: request.operation,
          inputSha256, durationMs: Date.now() - startedAt, errorCode: failureCode(command.reason),
        };
        const result = { receipt, invoked, failed: { ...receipt, message: command.reason } };
        this.completed.set(requestId, result);
        return result;
      }
      output = {
        mode: request.mode,
        planned: true,
        operation: request.operation,
        argv: command.normalizedArgv,
        ...(request.mode === 'fixture' ? { fixtureExitCode: 0 } : {}),
      };
    }

    const outputSha256 = sha256(output);
    const receipt: ToolExecutionReceipt = {
      schemaVersion: 'tool.execution-receipt.v1', requestId, mode: request.mode,
      status: request.mode === 'dry_run' ? 'dry_run' : 'succeeded', tool: request.tool,
      operation: request.operation, inputSha256, outputSha256, durationMs: Date.now() - startedAt,
    };
    const result = { receipt, output, invoked, completed: { ...receipt, output } };
    this.completed.set(requestId, result);
    return result;
  }
}

/**
 * The first real execution slice. It reads a regular file below the workspace
 * root or, with workspace-write policy and any required approval, atomically
 * writes a bounded UTF-8 file. Read output is capped and redacted before it
 * enters RunEvent/receipt output; write content is never echoed into a receipt.
 */
export class LocalToolRuntime {
  private readonly completed = new Map<string, ToolExecutionResult>();

  async execute(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
    const requestId = request.requestId ?? `tool-request-${randomUUID()}`;
    const startedAt = Date.now();
    const input = {
      mode: request.mode,
      tool: request.tool,
      operation: request.operation,
      workspaceRoot: request.workspaceRoot,
      path: request.path ?? null,
      contentSha256: typeof request.content === 'string' ? sha256(request.content) : null,
      argv: request.argv ?? null,
      maxBytes: request.maxBytes ?? 64_000,
    };
    const inputSha256 = sha256(input);
    const previous = this.completed.get(requestId);
    if (previous) return previous;

    const invoked: JsonObject = {
      requestId,
      runId: request.runId ?? null,
      mode: request.mode,
      tool: request.tool,
      operation: request.operation,
      inputSha256,
      execution: 'local_sandbox',
      ...(request.authorization ? { policyVersion: request.authorization.policyVersion, authorizationStatus: request.authorization.status } : {}),
    };
    const authorization = authorizationGuard(request.authorization);
    if (!authorization.allowed) {
      const result = localFailure(requestId, request, inputSha256, startedAt, failureCode(authorization.reason ?? 'authorization_revoked'), invoked, authorization.reason ?? 'authorization_revoked');
      this.completed.set(requestId, result);
      return result;
    }
    if (!operationMatchesTool(request.tool, request.operation)) {
      const result = localFailure(requestId, request, inputSha256, startedAt, 'tool_operation_mismatch', invoked, 'tool_operation_mismatch');
      this.completed.set(requestId, result);
      return result;
    }
    const operationGuard = canUseSandboxOperation(request.policy, request.operation);
    if (!operationGuard.allowed) {
      const result = localFailure(requestId, request, inputSha256, startedAt, failureCode(operationGuard.reason ?? 'denied'), invoked, operationGuard.reason ?? 'tool_not_allowed');
      this.completed.set(requestId, result);
      return result;
    }
    if (request.mode !== 'local') {
      const result = localFailure(requestId, request, inputSha256, startedAt, 'tool_invalid_mode', invoked, 'local_runtime_requires_local_mode');
      this.completed.set(requestId, result);
      return result;
    }
    if (request.tool === 'shell' && request.operation === 'shell') {
      const command = isAllowedCommand(request.argv ?? [], request.policy);
      if (!command.allowed) {
        const result = localFailure(requestId, request, inputSha256, startedAt, failureCode(command.reason), invoked, command.reason);
        this.completed.set(requestId, result);
        return result;
      }
      const normalizedCommand = command.normalizedArgv.join(' ');
      if (!['git status --short', 'git diff --stat'].includes(normalizedCommand)) {
        const result = localFailure(requestId, request, inputSha256, startedAt, 'tool_command_not_allowed_for_local_runtime', invoked, 'local_runtime_only_supports_readonly_git_commands');
        this.completed.set(requestId, result);
        return result;
      }
      const workspace = await resolveSandboxPath(request.workspaceRoot, '.');
      if (!workspace.ok) {
        const result = localFailure(requestId, request, inputSha256, startedAt, failureCode(workspace.reason), invoked, workspace.reason);
        this.completed.set(requestId, result);
        return result;
      }
      const processResult = await runReadOnlyCommand(command.normalizedArgv, workspace.path, request.timeoutMs ?? 10_000);
      const stdout = redactSecrets(processResult.stdout);
      const stderr = redactSecrets(processResult.stderr);
      const output: JsonObject = {
        mode: 'local',
        operation: 'shell',
        argv: command.normalizedArgv,
        exitCode: processResult.exitCode,
        timedOut: processResult.timedOut,
        stdout: stdout.value,
        stderr: stderr.value,
        redacted: stdout.redacted || stderr.redacted,
      };
      const failed = processResult.timedOut || processResult.exitCode !== 0;
      const receipt: ToolExecutionReceipt = {
        schemaVersion: 'tool.execution-receipt.v1', requestId, mode: request.mode,
        status: failed ? 'failed' : 'succeeded', tool: request.tool, operation: request.operation,
        inputSha256, outputSha256: sha256(output), durationMs: Date.now() - startedAt,
        ...(processResult.timedOut ? { errorCode: 'tool_timeout' } : processResult.exitCode !== 0 ? { errorCode: 'tool_process_exit' } : {}),
        ...(output.redacted ? { redacted: true } : {}),
      };
      const result = failed
        ? { receipt, output, invoked, failed: { ...receipt, output, message: processResult.timedOut ? 'command_timeout' : 'command_failed' } }
        : { receipt, output, invoked, completed: { ...receipt, output } };
      this.completed.set(requestId, result);
      return result;
    }
    if (request.tool !== 'filesystem' || (request.operation !== 'read' && request.operation !== 'write')) {
      const result = localFailure(requestId, request, inputSha256, startedAt, 'tool_operation_not_supported', invoked, 'local_runtime_only_supports_filesystem_read_or_write');
      this.completed.set(requestId, result);
      return result;
    }
    if (!request.path) {
      const result = localFailure(requestId, request, inputSha256, startedAt, 'tool_path_required', invoked, 'path_required');
      this.completed.set(requestId, result);
      return result;
    }

    if (request.operation === 'write' && typeof request.content !== 'string') {
      const result = localFailure(requestId, request, inputSha256, startedAt, 'tool_content_required', invoked, 'content_required');
      this.completed.set(requestId, result);
      return result;
    }

    if (request.operation === 'write' && request.policy.approvalRequiredActions.includes('filesystem.write') && request.approvalGranted !== true) {
      const result = localFailure(requestId, request, inputSha256, startedAt, 'tool_approval_required', invoked, 'filesystem_write_requires_approval');
      this.completed.set(requestId, result);
      return result;
    }

    const resolved = await resolveSandboxPath(request.workspaceRoot, request.path);
    if (!resolved.ok) {
      const result = localFailure(requestId, request, inputSha256, startedAt, failureCode(resolved.reason), invoked, resolved.reason);
      this.completed.set(requestId, result);
      return result;
    }
    const pathGuard = isAllowedWorkspacePath(resolved.relativePath, request.policy.allowedPaths);
    if (!pathGuard.allowed) {
      const result = localFailure(requestId, request, inputSha256, startedAt, failureCode(pathGuard.reason ?? 'path_not_allowlisted'), invoked, pathGuard.reason ?? 'path_not_allowlisted');
      this.completed.set(requestId, result);
      return result;
    }
    const maxBytes = Math.max(1, Math.min(256_000, Math.floor(request.maxBytes ?? 64_000)));
    if (request.operation === 'write') {
      const content = request.content as string;
      const maxBytes = Math.max(1, Math.min(256_000, Math.floor(request.maxBytes ?? 64_000)));
      const contentBytes = Buffer.byteLength(content, 'utf8');
      if (contentBytes > maxBytes) {
        const result = localFailure(requestId, request, inputSha256, startedAt, 'tool_content_too_large', invoked, `content_exceeds_max_bytes:${maxBytes}`);
        this.completed.set(requestId, result);
        return result;
      }
      let tempPath: string | undefined;
      try {
        // resolveSandboxPath rejects symlink components and keeps the target below
        // the workspace. The temporary file is created beside the target, then
        // atomically renamed so readers never observe a partial write.
        const destination = await stat(resolved.path).then((item) => {
          if (!item.isFile()) throw Object.assign(new Error('not_a_regular_file'), { code: 'EISDIR' });
          return item;
        }).catch((error: unknown) => {
          if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
          throw error;
        });
        // Replacing an existing file is a potentially destructive mutation even
        // when the bot's general tier is workspace_write. Require a fresh
        // one-off approval for that case; creating a new file can follow the
        // workspace policy unless it explicitly requires approval too.
        if (destination && request.approvalGranted !== true) {
          const result = localFailure(requestId, request, inputSha256, startedAt, 'tool_approval_required', invoked, 'overwriting_existing_file_requires_approval');
          this.completed.set(requestId, result);
          return result;
        }
        const suffix = `.agent-workspace-${requestId.replace(/[^A-Za-z0-9_-]/g, '_')}-${randomUUID()}.tmp`;
        tempPath = `${resolved.path}.${suffix}`;
        const tempHandle = await open(tempPath, 'wx', 0o600);
        try {
          await tempHandle.writeFile(content, 'utf8');
          if (destination) await tempHandle.chmod(destination.mode & 0o777);
          await tempHandle.sync();
        } finally {
          await tempHandle.close().catch(() => undefined);
        }
        await rename(tempPath, resolved.path);
        tempPath = undefined;
        const output: JsonObject = {
          mode: 'local',
          operation: 'write',
          relativePath: resolved.relativePath,
          bytesWritten: contentBytes,
          contentSha256: sha256(content),
          replacedExisting: Boolean(destination),
        };
        const receipt: ToolExecutionReceipt = {
          schemaVersion: 'tool.execution-receipt.v1', requestId, mode: request.mode,
          status: 'succeeded', tool: request.tool, operation: request.operation,
          inputSha256, outputSha256: sha256(output), durationMs: Date.now() - startedAt,
        };
        const result = { receipt, output, invoked, completed: { ...receipt, output } };
        this.completed.set(requestId, result);
        return result;
      } catch (error) {
        const code = error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : 'write_failed';
        const result = localFailure(requestId, request, inputSha256, startedAt, failureCode(code.toLowerCase()), invoked, error instanceof Error ? error.message : String(error));
        this.completed.set(requestId, result);
        return result;
      } finally {
        if (tempPath) await unlink(tempPath).catch(() => undefined);
      }
    }

    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      const fileStat = await stat(resolved.path);
      if (!fileStat.isFile()) throw Object.assign(new Error('not_a_regular_file'), { code: 'EISDIR' });
      handle = await open(resolved.path, 'r');
      const buffer = Buffer.alloc(maxBytes + 1);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      const truncated = bytesRead > maxBytes;
      const raw = buffer.subarray(0, Math.min(bytesRead, maxBytes)).toString('utf8');
      const redacted = redactSecrets(raw);
      const output: JsonObject = {
        mode: 'local',
        relativePath: resolved.relativePath,
        bytesRead: Buffer.byteLength(raw, 'utf8'),
        truncated,
        content: redacted.value,
        contentSha256: sha256(redacted.value),
        redacted: redacted.redacted,
      };
      const receipt: ToolExecutionReceipt = {
        schemaVersion: 'tool.execution-receipt.v1', requestId, mode: request.mode,
        status: 'succeeded', tool: request.tool, operation: request.operation,
        inputSha256, outputSha256: sha256(output), durationMs: Date.now() - startedAt,
        ...(redacted.redacted ? { redacted: true } : {}),
      };
      const result = { receipt, output, invoked, completed: { ...receipt, output } };
      this.completed.set(requestId, result);
      return result;
    } catch (error) {
      const code = error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : 'read_failed';
      const result = localFailure(requestId, request, inputSha256, startedAt, failureCode(code.toLowerCase()), invoked, error instanceof Error ? error.message : String(error));
      this.completed.set(requestId, result);
      return result;
    } finally {
      await handle?.close().catch(() => undefined);
    }
  }
}
