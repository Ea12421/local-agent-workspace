import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createExecutionPlan, transitionExecutionPlan, transitionExecutionPlanStep } from '../../../packages/core/src/orchestrator.ts';
import { appendExecutionPlanCreated, appendExecutionPlanEvent, appendExecutionPlanStarted, appendExecutionPlanStepEvent } from './orchestrator-events.ts';
import { openSqliteProductBuilderContinuity } from './persistence.ts';

test('execution plan lifecycle events are append-only, replayable and idempotent', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-plan-events-'));
  const handle = openSqliteProductBuilderContinuity(path.join(dir, 'workspace.db'));
  if (!handle) {
    await rm(dir, { recursive: true, force: true });
    return;
  }
  const plan = createExecutionPlan({
    id: 'plan-events-1' as any,
    projectId: 'project-events-1' as any,
    runId: 'run-events-1' as any,
    objective: '读取并整理项目状态',
    intent: 'inspect_project',
    steps: [{ id: 'step-events-1' as any, order: 1, objective: '读取项目目录', toolId: 'tool-files-read' }],
    now: '2026-10-07T03:00:00.000Z',
  });
  const created = await appendExecutionPlanCreated(handle.eventLog, plan);
  const createdAgain = await appendExecutionPlanCreated(handle.eventLog, plan);
  assert.equal(created.id, createdAgain.id);
  const running = transitionExecutionPlan(plan, 'start', { now: '2026-10-07T03:00:01.000Z' });
  await appendExecutionPlanStarted(handle.eventLog, running);
  const stepRunning = transitionExecutionPlanStep(running, 'step-events-1' as any, 'start', { now: '2026-10-07T03:00:02.000Z' });
  await appendExecutionPlanStepEvent(handle.eventLog, stepRunning, 'plan.step_started', stepRunning.steps[0]!);
  const events = await handle.eventLog.readAll();
  assert.deepEqual(events.filter((event) => String(event.runId) === 'run-events-1').map((event) => event.type), ['plan.created', 'plan.started', 'plan.step_started']);
  assert.equal(events.filter((event) => String(event.runId) === 'run-events-1').every((event) => String((event.data as { planId?: unknown }).planId) === 'plan-events-1'), true);
  const restored = openSqliteProductBuilderContinuity(path.join(dir, 'workspace.db'))!;
  const duplicateWithCustomKey = await appendExecutionPlanEvent(restored.eventLog, stepRunning, 'plan.step_started', { step: stepRunning.steps[0]!, idempotencyKey: 'manual-plan-step-key' });
  assert.equal(duplicateWithCustomKey.type, 'plan.step_started');
  assert.equal((await restored.eventLog.readAll()).filter((event) => String(event.runId) === 'run-events-1').length, 4);
  restored.close();
  handle.close();
  await rm(dir, { recursive: true, force: true });
});
