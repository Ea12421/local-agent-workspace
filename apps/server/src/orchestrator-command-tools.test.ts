import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(os.tmpdir(), 'local-agent-workspace-orchestrator-command-'));
const projectDir = await mkdtemp(path.join(os.tmpdir(), 'local-agent-workspace-command-project-'));
process.env.AGENT_WORKSPACE_DB = path.join(dataDir, 'workspace.db');
process.env.AGENT_WORKSPACE_DATA_DIR = dataDir;
process.env.AGENT_WORKSPACE_PROJECT_ROOT = projectDir;

const { openSqliteProductBuilderContinuity } = await import('./persistence.ts');
const continuity = openSqliteProductBuilderContinuity(process.env.AGENT_WORKSPACE_DB)!;
const projectId = 'orchestrator-command-project' as any;
continuity.entityStore.saveProject({
  id: projectId,
  name: '受控命令测试项目',
  workspacePath: projectDir,
  createdAt: '2026-10-08T00:00:00.000Z',
  updatedAt: '2026-10-08T00:00:00.000Z',
});
await writeFile(path.join(projectDir, 'package.json'), JSON.stringify({
  name: 'controlled-command-fixture',
  private: true,
  scripts: {
    test: "node -e \"process.stdout.write('fixture-test-ok')\"",
    'build:web': "node -e \"require('node:fs').writeFileSync('web-build.txt','fixture-build-ok')\"",
  },
}, null, 2));

const { executeRealOrchestratorStep } = await import('./orchestrator-tools.ts');
const { runtimeStore } = await import('./runtime.ts');

const policy = {
  permissionTier: 'read_only' as const,
  allowedTools: ['command'],
  allowedCommands: ['npm run test', 'npm run build:web'],
  allowedPaths: [],
  policyVersion: 1,
  approvalRequiredActions: ['command.run'],
};

function planAndStep(stepId: string, toolId: string) {
  const plan: any = {
    id: 'plan-command-bridge' as any,
    projectId,
    runId: 'parent-plan-run' as any,
    objective: '验证受控命令桥',
    intent: 'controlled_task' as const,
    status: 'running' as const,
    steps: [],
    maxSteps: 4,
    createdAt: '2026-10-08T00:00:00.000Z',
    updatedAt: '2026-10-08T00:00:00.000Z',
  };
  const step = {
    id: stepId as any,
    planId: plan.id,
    order: 1,
    objective: `执行 ${toolId}`,
    dependsOn: [],
    toolId,
    inputRefs: [],
    outputRefs: [],
    status: 'running' as const,
    approvalRequired: true,
    attempt: 1,
    maxAttempts: 1,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
  plan.steps = [step];
  return { plan: plan as any, step: step as any };
}

test.after(async () => {
  continuity.close();
  delete process.env.AGENT_WORKSPACE_DB;
  delete process.env.AGENT_WORKSPACE_DATA_DIR;
  delete process.env.AGENT_WORKSPACE_PROJECT_ROOT;
  await rm(dataDir, { recursive: true, force: true });
  await rm(projectDir, { recursive: true, force: true });
});

test('orchestrator command bridge waits for a matching approval, runs real fixed profiles, and reuses the child run', async () => {
  const testCase = planAndStep('step-command-test', 'command.project.test');
  const scope = { projectId, botId: 'orchestrator-command-bot' as any };
  const waiting = await executeRealOrchestratorStep(testCase.step, testCase.plan, scope, { entityStore: continuity.entityStore, toolPolicy: policy });
  assert.equal(waiting.status, 'waiting_user');
  assert.equal((await runtimeStore.listRuns(String(projectId))).length, 0);

  const first = await executeRealOrchestratorStep(testCase.step, testCase.plan, scope, {
    oneOffApprovedStepId: String(testCase.step.id),
    entityStore: continuity.entityStore,
    toolPolicy: policy,
  });
  assert.equal(first.status, 'succeeded');
  assert.equal(first.data?.commandId, 'project.test');
  assert.deepEqual(first.data?.argv, ['npm', 'run', 'test']);

  const replay = await executeRealOrchestratorStep(testCase.step, testCase.plan, scope, {
    oneOffApprovedStepId: String(testCase.step.id),
    entityStore: continuity.entityStore,
    toolPolicy: policy,
  });
  assert.equal(replay.status, 'succeeded');
  assert.equal(replay.data?.subRunId, first.data?.subRunId);

  const childRuns = await runtimeStore.listRuns(String(projectId));
  assert.equal(childRuns.length, 1);
  const events = await runtimeStore.listEvents(childRuns[0]!.id);
  assert.equal(events.filter((event) => event.type === 'approval.requested').length, 1);
  assert.equal(events.filter((event) => event.type === 'approval.resolved').length, 1);
  assert.equal(events.filter((event) => event.type === 'tool.invoked').length, 1);
  const approvals = continuity.entityStore.listApprovals(String(projectId)).filter((item) => item.metadata?.kind === 'orchestrator_command');
  assert.equal(approvals.length, 1);
  assert.equal(approvals[0]?.status, 'approved');
  assert.equal(approvals[0]?.metadata?.oneOff, true);

  const buildCase = planAndStep('step-command-build', 'command.project.build_web');
  const build = await executeRealOrchestratorStep(buildCase.step, buildCase.plan, scope, {
    oneOffApprovedStepId: String(buildCase.step.id),
    entityStore: continuity.entityStore,
    toolPolicy: policy,
  });
  assert.equal(build.status, 'succeeded');
  assert.equal(build.data?.commandId, 'project.build_web');
  assert.deepEqual(build.data?.argv, ['npm', 'run', 'build:web']);
});

test('orchestrator command bridge refuses a disabled live Bot capability before creating a child run', async () => {
  const testCase = planAndStep('step-command-disabled', 'command.project.test');
  const before = (await runtimeStore.listRuns(String(projectId))).length;
  const denied = await executeRealOrchestratorStep(testCase.step, testCase.plan, { projectId, botId: 'orchestrator-command-bot' as any }, {
    oneOffApprovedStepId: String(testCase.step.id),
    entityStore: continuity.entityStore,
    toolPolicy: { ...policy, allowedTools: [], allowedCommands: [] },
  });
  assert.equal(denied.status, 'failed');
  assert.equal(denied.error, 'tool_command_not_allowlisted');
  assert.equal((await runtimeStore.listRuns(String(projectId))).length, before);
});
