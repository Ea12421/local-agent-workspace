import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createExecutionPlan } from '../../../packages/core/src/orchestrator.ts';
import { executeExecutionPlan } from './orchestrator-runtime.ts';
import { openSqliteProductBuilderContinuity } from './persistence.ts';

test('orchestrator runtime executes dependency-ready steps and replays without rerunning success', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-orchestrator-runtime-'));
  const handle = openSqliteProductBuilderContinuity(path.join(dir, 'workspace.db'))!;
  const plan = createExecutionPlan({
    id: 'plan-runtime-1' as any,
    projectId: 'project-runtime-1' as any,
    runId: 'run-runtime-1' as any,
    objective: '检查项目并生成摘要',
    intent: 'inspect_project',
    steps: [
      { id: 'step-runtime-1' as any, order: 1, objective: '读取项目目录', toolId: 'filesystem.read' },
      { id: 'step-runtime-2' as any, order: 2, objective: '整理摘要', toolId: 'filesystem.read', dependsOn: ['step-runtime-1' as any] },
    ],
  });
  handle.entityStore.saveExecutionPlan(plan);
  let executions = 0;
  const first = await executeExecutionPlan({
    planStore: handle.entityStore,
    eventLog: handle.eventLog,
    now: () => '2026-10-07T04:00:00.000Z',
    executeStep: async () => { executions += 1; return { status: 'succeeded', outputRefs: [`artifact-${executions}`] }; },
  }, plan);
  assert.equal(first.plan.status, 'succeeded');
  assert.equal(executions, 2);
  const replay = await executeExecutionPlan({
    planStore: handle.entityStore,
    eventLog: handle.eventLog,
    executeStep: async () => { executions += 1; return { status: 'succeeded' }; },
  }, first.plan);
  assert.equal(replay.plan.status, 'succeeded');
  assert.equal(executions, 2);
  assert.deepEqual((await handle.eventLog.readAll()).filter((event) => String(event.runId) === 'run-runtime-1').map((event) => event.type), ['plan.created', 'plan.started', 'plan.step_started', 'plan.step_completed', 'plan.step_started', 'plan.step_completed', 'plan.succeeded']);
  handle.close();
  await rm(dir, { recursive: true, force: true });
});

test('orchestrator runtime stops before an approval-required step', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-orchestrator-approval-'));
  const handle = openSqliteProductBuilderContinuity(path.join(dir, 'workspace.db'))!;
  const plan = createExecutionPlan({
    id: 'plan-runtime-approval' as any,
    projectId: 'project-runtime-approval' as any,
    runId: 'run-runtime-approval' as any,
    objective: '运行项目测试',
    intent: 'controlled_task',
    steps: [{ id: 'step-runtime-approval' as any, order: 1, objective: '运行测试命令', toolId: 'command.run', approvalRequired: true }],
  });
  handle.entityStore.saveExecutionPlan(plan);
  let executed = false;
  const result = await executeExecutionPlan({
    planStore: handle.entityStore,
    eventLog: handle.eventLog,
    executeStep: async () => { executed = true; return { status: 'succeeded' }; },
  }, plan);
  assert.equal(executed, false);
  assert.equal(result.plan.status, 'waiting_user');
  assert.equal(result.plan.steps[0]?.status, 'waiting_user');
  assert.match(result.waitingReason ?? '', /审批/);
  assert.deepEqual((await handle.eventLog.readAll()).filter((event) => String(event.runId) === 'run-runtime-approval').map((event) => event.type), ['plan.created', 'plan.started', 'plan.step_blocked', 'plan.waiting_user']);
  const resumed = await executeExecutionPlan({
    planStore: handle.entityStore,
    eventLog: handle.eventLog,
    approvedStepIds: new Set(['step-runtime-approval']),
    executeStep: async () => ({ status: 'succeeded', outputRefs: ['artifact:approved'] }),
  }, result.plan);
  assert.equal(resumed.plan.status, 'succeeded');
  assert.equal(resumed.plan.steps[0]?.status, 'succeeded');
  assert.deepEqual((await handle.eventLog.readAll()).filter((event) => String(event.runId) === 'run-runtime-approval').map((event) => event.type), ['plan.created', 'plan.started', 'plan.step_blocked', 'plan.waiting_user', 'plan.resumed', 'plan.step_started', 'plan.step_completed', 'plan.succeeded']);
  handle.close();
  await rm(dir, { recursive: true, force: true });
});
