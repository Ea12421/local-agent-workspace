import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ApprovalRequestId } from '../../core/src/index.ts';
import { ControlledCommandRuntime, CONTROLLED_COMMAND_PROFILES, type ControlledCommandProfile } from './command-runtime.ts';

function policy(argv: string[], overrides: Partial<Parameters<ControlledCommandRuntime['execute']>[0]['policy']> = {}) {
  return {
    permissionTier: 'read_only' as const,
    allowedTools: ['command'],
    allowedCommands: [argv.join(' ')],
    approvalRequiredActions: ['command.run'],
    ...overrides,
  };
}

test('controlled profiles expose only the fixed test and Web build commands', () => {
  assert.deepEqual(CONTROLLED_COMMAND_PROFILES.map((item) => ({ id: item.id, argv: [...item.argv] })), [
    { id: 'project.test', argv: ['npm', 'run', 'test'] },
    { id: 'project.build_web', argv: ['npm', 'run', 'build:web'] },
  ]);
  assert.equal(CONTROLLED_COMMAND_PROFILES[1].declaredEffects.includes('write_build_output'), true);
});

test('dry-run validates the profile without starting a process', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-command-dry-run-'));
  try {
    const profile = CONTROLLED_COMMAND_PROFILES[0];
    const runtime = new ControlledCommandRuntime();
    const result = await runtime.execute({ requestId: 'command-dry-001', mode: 'dry_run', commandId: profile.id, workspaceRoot: root, policy: policy([...profile.argv]) });
    assert.equal(result.receipt.status, 'dry_run');
    assert.equal(result.output?.planned, true);
    assert.deepEqual(result.output?.argv, [...profile.argv]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('execution requires read-only policy, exact argv, and one-off approval', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-command-policy-'));
  try {
    const profile = CONTROLLED_COMMAND_PROFILES[0];
    const runtime = new ControlledCommandRuntime();
    const base = { requestId: 'command-policy-001', mode: 'local' as const, commandId: profile.id, workspaceRoot: root, policy: policy([...profile.argv]) };
    const missingApproval = await runtime.execute(base);
    assert.equal(missingApproval.receipt.errorCode, 'tool_approval_required');
    const wrongArgv = await runtime.execute({ ...base, requestId: 'command-policy-002', argv: ['npm', 'run', 'test', '--', '--unsafe'], approvalGranted: true });
    assert.equal(wrongArgv.receipt.errorCode, 'tool_command_argv_mismatch');
    const wrongTier = await runtime.execute({ ...base, requestId: 'command-policy-003', approvalGranted: true, policy: policy([...profile.argv], { permissionTier: 'workspace_write' }) });
    assert.equal(wrongTier.receipt.errorCode, 'tool_command_permission_tier_not_allowed');
    const missingTool = await runtime.execute({ ...base, requestId: 'command-policy-004', approvalGranted: true, policy: policy([...profile.argv], { allowedTools: [] }) });
    assert.equal(missingTool.receipt.errorCode, 'tool_command_not_allowlisted');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a custom fixed profile executes, caps output, redacts secrets, and is idempotent', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-command-exec-'));
  const script = 'spam.mjs';
  await writeFile(path.join(root, script), 'process.stdout.write("sk-1234567890abcdef\\n" + "x".repeat(10000));\n', 'utf8');
  const profile: ControlledCommandProfile = {
    id: 'fixture.spam', label: 'fixture', argv: [process.execPath, script], timeoutMs: 5_000,
    maxOutputBytes: 2_048, declaredEffects: ['read_workspace'], approvalAction: 'command.run',
  };
  try {
    const runtime = new ControlledCommandRuntime([profile]);
    const request = { requestId: 'command-exec-001', mode: 'local' as const, commandId: profile.id, workspaceRoot: root, policy: policy([...profile.argv]), approvalGranted: true, maxBytes: 1_024 };
    const first = await runtime.execute(request);
    assert.equal(first.receipt.status, 'succeeded');
    assert.equal(first.output?.truncated, true);
    assert.equal(first.output?.redacted, true);
    assert.doesNotMatch(String(first.output?.stdout), /sk-1234567890abcdef/);
    assert.deepEqual(await runtime.execute(request), first);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('timeout and AbortSignal cancellation become explicit failed receipts', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-command-cancel-'));
  const script = 'wait.mjs';
  await writeFile(path.join(root, script), 'setTimeout(() => {}, 10_000);\n', 'utf8');
  const profile: ControlledCommandProfile = {
    id: 'fixture.wait', label: 'fixture', argv: [process.execPath, script], timeoutMs: 2_000,
    maxOutputBytes: 2_048, declaredEffects: ['read_workspace'], approvalAction: 'command.run',
  };
  try {
    const runtime = new ControlledCommandRuntime([profile]);
    const timedOut = await runtime.execute({ requestId: 'command-timeout-001', mode: 'local', commandId: profile.id, workspaceRoot: root, policy: policy([...profile.argv]), approvalGranted: true, timeoutMs: 100 });
    assert.equal(timedOut.receipt.errorCode, 'tool_timeout');
    const controller = new AbortController();
    const running = runtime.execute({ requestId: 'command-cancel-001', mode: 'local', commandId: profile.id, workspaceRoot: root, policy: policy([...profile.argv]), approvalGranted: true, signal: controller.signal });
    setTimeout(() => controller.abort(), 50);
    const cancelled = await running;
    assert.equal(cancelled.receipt.errorCode, 'tool_cancelled');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('authorization and workspace scope failures never start a process', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-command-auth-'));
  try {
    const profile = CONTROLLED_COMMAND_PROFILES[0];
    const runtime = new ControlledCommandRuntime();
    const revoked = await runtime.execute({ requestId: 'command-auth-001', mode: 'local', commandId: profile.id, workspaceRoot: root, policy: policy([...profile.argv]), approvalGranted: true, authorization: { status: 'revoked', policyVersion: 1, approvalId: 'approval-1' as ApprovalRequestId } });
    assert.equal(revoked.receipt.errorCode, 'tool_authorization_revoked');
    const scoped = await runtime.execute({ requestId: 'command-auth-002', mode: 'local', commandId: profile.id, workspaceRoot: root, policy: policy([...profile.argv], { allowedPaths: ['apps/web'] }), approvalGranted: true });
    assert.equal(scoped.receipt.errorCode, 'tool_command_scope_not_allowlisted');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
