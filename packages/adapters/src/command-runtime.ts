import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import type { JsonObject, ToolAuthorizationSnapshot, ToolPolicy } from '../../core/src/index.ts';
import { isAllowedCommand, resolveSandboxPath } from './sandbox.ts';

/**
 * A deliberately small command surface for project diagnostics.  The profile
 * owns the argv vector; callers may select a profile but may not replace its
 * command or append arguments.
 */
export type ControlledCommandId = 'project.test' | 'project.build_web' | (string & {});

export type ControlledCommandProfile = {
  id: ControlledCommandId;
  label: string;
  argv: readonly string[];
  timeoutMs: number;
  maxOutputBytes: number;
  /** The build profile can create generated output, so it always needs approval. */
  declaredEffects: readonly ('read_workspace' | 'write_build_output')[];
  approvalAction: 'command.run';
};

export const CONTROLLED_COMMAND_PROFILES: readonly ControlledCommandProfile[] = Object.freeze([
  Object.freeze({
    id: 'project.test' as const,
    label: '运行项目测试',
    argv: Object.freeze(['npm', 'run', 'test']),
    timeoutMs: 120_000,
    maxOutputBytes: 128_000,
    declaredEffects: Object.freeze(['read_workspace'] as const),
    approvalAction: 'command.run' as const,
  }),
  Object.freeze({
    id: 'project.build_web' as const,
    label: '构建 Web',
    argv: Object.freeze(['npm', 'run', 'build:web']),
    timeoutMs: 120_000,
    maxOutputBytes: 128_000,
    declaredEffects: Object.freeze(['read_workspace', 'write_build_output'] as const),
    approvalAction: 'command.run' as const,
  }),
]);

export type ControlledCommandMode = 'dry_run' | 'local';

export type ControlledCommandRequest = {
  requestId?: string;
  runId?: string;
  mode: ControlledCommandMode;
  commandId: ControlledCommandId;
  workspaceRoot: string;
  policy: ToolPolicy;
  /** Must exactly equal the profile argv when supplied. */
  argv?: string[];
  /** The control plane sets this only after resolving a fresh approval. */
  approvalGranted?: boolean;
  authorization?: ToolAuthorizationSnapshot;
  maxBytes?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
};

export type ControlledCommandReceipt = {
  schemaVersion: 'controlled-command-receipt.v1';
  requestId: string;
  commandId: string;
  mode: ControlledCommandMode;
  status: 'dry_run' | 'succeeded' | 'failed';
  inputSha256: string;
  outputSha256?: string;
  durationMs: number;
  errorCode?: string;
  redacted?: boolean;
};

export type ControlledCommandResult = {
  receipt: ControlledCommandReceipt;
  invoked: JsonObject;
  output?: JsonObject;
  completed?: JsonObject;
  failed?: JsonObject;
};

type ProcessResult = {
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  cancelled: boolean;
  truncated: boolean;
  spawnError?: string;
};

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
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

function authorizationGuard(authorization?: ToolAuthorizationSnapshot): { allowed: boolean; reason?: string } {
  if (!authorization || authorization.status === 'not_required' || authorization.status === 'approved') return { allowed: true };
  if (authorization.status === 'expired') return { allowed: false, reason: 'authorization_expired' };
  if (authorization.status === 'cancelled') return { allowed: false, reason: 'authorization_cancelled' };
  return { allowed: false, reason: 'authorization_revoked' };
}

function boundedAppend(current: string, chunk: unknown, maxBytes: number): { value: string; truncated: boolean } {
  const incoming = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8');
  const currentBuffer = Buffer.from(current, 'utf8');
  if (currentBuffer.byteLength >= maxBytes) return { value: currentBuffer.subarray(0, maxBytes).toString('utf8'), truncated: true };
  if (currentBuffer.byteLength + incoming.byteLength <= maxBytes) {
    return { value: Buffer.concat([currentBuffer, incoming]).toString('utf8'), truncated: false };
  }
  const remaining = Math.max(0, maxBytes - currentBuffer.byteLength);
  return { value: Buffer.concat([currentBuffer, incoming.subarray(0, remaining)]).toString('utf8'), truncated: true };
}

function clampTimeout(profile: ControlledCommandProfile, requested?: number): number {
  const candidate = Number.isFinite(requested) ? Math.floor(requested as number) : profile.timeoutMs;
  return Math.max(100, Math.min(profile.timeoutMs, candidate));
}

function clampOutput(profile: ControlledCommandProfile, requested?: number): number {
  const candidate = Number.isFinite(requested) ? Math.floor(requested as number) : profile.maxOutputBytes;
  return Math.max(1_024, Math.min(profile.maxOutputBytes, candidate));
}

function runControlledProcess(argv: string[], cwd: string, timeoutMs: number, maxBytes: number, signal?: AbortSignal): Promise<ProcessResult> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve({ exitCode: null, signal: null, stdout: '', stderr: '', timedOut: false, cancelled: true, truncated: false });
      return;
    }

    let child;
    try {
      child = spawn(argv[0], argv.slice(1), { cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      resolve({ exitCode: null, signal: null, stdout: '', stderr: '', timedOut: false, cancelled: false, truncated: false, spawnError: error instanceof Error ? error.message : String(error) });
      return;
    }

    const streamLimit = Math.max(512, Math.floor(maxBytes / 2));
    let stdout = '';
    let stderr = '';
    let truncated = false;
    let timedOut = false;
    let cancelled = false;
    let settled = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = (result: ProcessResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      signal?.removeEventListener('abort', onAbort);
      resolve(result);
    };
    const terminate = (kind: 'timeout' | 'cancel') => {
      if (settled) return;
      if (kind === 'timeout') timedOut = true;
      else cancelled = true;
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), 1_000);
    };
    const onAbort = () => terminate('cancel');
    const timer = setTimeout(() => terminate('timeout'), timeoutMs);
    signal?.addEventListener('abort', onAbort, { once: true });
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk) => {
      const next = boundedAppend(stdout, chunk, streamLimit);
      stdout = next.value;
      truncated ||= next.truncated;
    });
    child.stderr?.on('data', (chunk) => {
      const next = boundedAppend(stderr, chunk, streamLimit);
      stderr = next.value;
      truncated ||= next.truncated;
    });
    child.once('error', (error) => finish({ exitCode: null, signal: null, stdout, stderr: `${stderr}${error.message}`, timedOut, cancelled, truncated, spawnError: error.message }));
    child.once('close', (exitCode, closeSignal) => finish({ exitCode, signal: closeSignal, stdout, stderr, timedOut, cancelled, truncated }));
  });
}

/**
 * Executes only versioned, project-owned command profiles.  This adapter is
 * intentionally separate from the general ToolRuntime until its contract has
 * passed focused security and lifecycle tests.
 */
export class ControlledCommandRuntime {
  private readonly completed = new Map<string, ControlledCommandResult>();
  private readonly profiles: readonly ControlledCommandProfile[];

  constructor(profiles: readonly ControlledCommandProfile[] = CONTROLLED_COMMAND_PROFILES) {
    this.profiles = profiles;
  }

  listProfiles(): readonly ControlledCommandProfile[] {
    return this.profiles;
  }

  async execute(request: ControlledCommandRequest): Promise<ControlledCommandResult> {
    const requestId = request.requestId ?? `command-request-${randomUUID()}`;
    const startedAt = Date.now();
    const profile = this.profiles.find((item) => item.id === request.commandId);
    const argv = request.argv ? [...request.argv] : profile ? [...profile.argv] : [];
    const input = {
      mode: request.mode,
      commandId: request.commandId,
      argv,
      workspaceRoot: request.workspaceRoot,
      maxBytes: request.maxBytes ?? null,
      timeoutMs: request.timeoutMs ?? null,
      policy: {
        permissionTier: request.policy.permissionTier,
        allowedTools: request.policy.allowedTools,
        allowedCommands: request.policy.allowedCommands ?? [],
        allowedPaths: request.policy.allowedPaths ?? [],
        policyVersion: request.policy.policyVersion ?? null,
        approvalRequiredActions: request.policy.approvalRequiredActions,
      },
      authorization: request.authorization?.status ?? null,
    };
    const inputSha256 = sha256(input);
    const previous = this.completed.get(requestId);
    if (previous) return previous;

    const invoked: JsonObject = {
      requestId,
      runId: request.runId ?? null,
      mode: request.mode,
      tool: 'controlled-command',
      operation: 'run',
      commandId: request.commandId,
      inputSha256,
      execution: 'controlled_local_command',
      ...(request.authorization ? { policyVersion: request.authorization.policyVersion, authorizationStatus: request.authorization.status } : {}),
    };

    const fail = (errorCode: string, message: string): ControlledCommandResult => {
      const receipt: ControlledCommandReceipt = {
        schemaVersion: 'controlled-command-receipt.v1', requestId, commandId: request.commandId,
        mode: request.mode, status: 'failed', inputSha256, durationMs: Date.now() - startedAt, errorCode,
      };
      const result = { receipt, invoked, failed: { ...receipt, message } };
      this.completed.set(requestId, result);
      return result;
    };

    const authorization = authorizationGuard(request.authorization);
    if (!authorization.allowed) return fail(`tool_${authorization.reason ?? 'authorization_revoked'}`, authorization.reason ?? 'authorization_revoked');
    if (!profile) return fail('tool_command_profile_not_found', 'command_profile_not_found');
    if (request.policy.permissionTier !== 'read_only') return fail('tool_command_permission_tier_not_allowed', 'command_requires_read_only_policy');
    if (!request.policy.allowedTools.includes('command')) return fail('tool_command_not_allowlisted', 'command_tool_not_allowlisted');
    if (request.policy.allowedPaths && request.policy.allowedPaths.length > 0) return fail('tool_command_scope_not_allowlisted', 'command_runs_at_workspace_root_only');
    if (request.argv && JSON.stringify(request.argv) !== JSON.stringify(profile.argv)) return fail('tool_command_argv_mismatch', 'argv_must_match_profile');
    const command = isAllowedCommand(argv, request.policy);
    if (!command.allowed) return fail(`tool_${command.reason}`, command.reason);

    const workspace = await resolveSandboxPath(request.workspaceRoot, '.');
    if (!workspace.ok) return fail(`tool_${workspace.reason}`, workspace.reason);

    if (request.mode === 'dry_run') {
      const output: JsonObject = {
        mode: 'dry_run', planned: true, commandId: profile.id, argv: command.normalizedArgv,
        cwdRelative: '.', declaredEffects: [...profile.declaredEffects], approvalRequired: true,
      };
      const receipt: ControlledCommandReceipt = {
        schemaVersion: 'controlled-command-receipt.v1', requestId, commandId: profile.id,
        mode: request.mode, status: 'dry_run', inputSha256, outputSha256: sha256(output), durationMs: Date.now() - startedAt,
      };
      const result = { receipt, invoked, output, completed: { ...receipt, output } };
      this.completed.set(requestId, result);
      return result;
    }

    if (!request.policy.approvalRequiredActions.includes(profile.approvalAction)) return fail('tool_command_approval_policy_missing', 'command_run_requires_approval_policy');
    if (request.approvalGranted !== true) return fail('tool_approval_required', 'command_run_requires_one_off_approval');

    const outputLimit = clampOutput(profile, request.maxBytes);
    const processResult = await runControlledProcess(command.normalizedArgv, workspace.path, clampTimeout(profile, request.timeoutMs), outputLimit, request.signal);
    const stdout = redactSecrets(processResult.stdout);
    const stderr = redactSecrets(processResult.stderr);
    const output: JsonObject = {
      mode: 'local', commandId: profile.id, argv: command.normalizedArgv, cwdRelative: '.',
      exitCode: processResult.exitCode, signal: processResult.signal, timedOut: processResult.timedOut,
      cancelled: processResult.cancelled, truncated: processResult.truncated,
      stdout: stdout.value, stderr: stderr.value,
      redacted: stdout.redacted || stderr.redacted,
    };
    const failed = processResult.cancelled || processResult.timedOut || Boolean(processResult.spawnError) || processResult.exitCode !== 0;
    const errorCode = processResult.cancelled
      ? 'tool_cancelled'
      : processResult.timedOut
        ? 'tool_timeout'
        : processResult.spawnError
          ? 'tool_spawn_failed'
          : processResult.exitCode !== 0
            ? 'tool_process_exit'
            : undefined;
    const receipt: ControlledCommandReceipt = {
      schemaVersion: 'controlled-command-receipt.v1', requestId, commandId: profile.id,
      mode: request.mode, status: failed ? 'failed' : 'succeeded', inputSha256,
      outputSha256: sha256(output), durationMs: Date.now() - startedAt,
      ...(errorCode ? { errorCode } : {}),
      ...(output.redacted ? { redacted: true } : {}),
    };
    const result = failed
      ? { receipt, invoked, output, failed: { ...receipt, output, message: errorCode ?? 'command_failed' } }
      : { receipt, invoked, output, completed: { ...receipt, output } };
    this.completed.set(requestId, result);
    return result;
  }
}
