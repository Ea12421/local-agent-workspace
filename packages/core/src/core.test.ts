import { strict as assert } from "node:assert";
import test from "node:test";
import {
  InMemoryRunStore,
  InvalidRunTransitionError,
  RetryBudgetExceededError,
  allowedActions,
  canTransition,
  transitionRun,
  type BotId,
  type ProjectId,
  type Run,
} from "./index.ts";

const projectId = "project_test" as ProjectId;
const botId = "bot_test" as BotId;

function runFixture(status: Run["status"] = "queued"): Run {
  return {
    id: "run_test" as Run["id"],
    projectId,
    botId,
    request: { objective: "test", input: {} },
    status,
    version: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

export async function runCoreTests(): Promise<void> {
  const queued = runFixture();
  const started = transitionRun(queued, "start", { now: "2026-01-01T00:00:01.000Z" });
  assert.equal(started.run.status, "running");
  assert.equal(started.run.version, 1);
  assert.equal(started.event.type, "run.started");
  assert.equal(queued.status, "queued", "pure transition must not mutate input");

  const waiting = transitionRun(started.run, "wait_user", { reason: "Need target audience" });
  const resumed = transitionRun(waiting.run, "resume");
  const succeeded = transitionRun(resumed.run, "succeed", { result: { ok: true } });
  assert.equal(succeeded.run.status, "succeeded");
  assert.deepEqual(succeeded.run.result, { ok: true });
  assert.deepEqual(allowedActions("failed"), ["retry"]);
  assert.equal(canTransition("succeeded", "retry"), false);
  assert.throws(() => transitionRun(succeeded.run, "cancel"), InvalidRunTransitionError);

  const failed = transitionRun(runFixture("running"), "fail", {
    error: { code: "TEST", message: "temporary", retryable: true },
  });
  const retried = transitionRun(failed.run, "retry");
  assert.equal(retried.run.status, "queued");
  assert.equal(retried.run.error, undefined);

  const store = new InMemoryRunStore();
  const run = await store.createRun({ projectId, botId, request: { objective: "persist", input: {} } });
  await store.transition(run.id, "start");
  await store.transition(run.id, "succeed", { result: { artifact: "a1" } });
  const events = await store.listEvents(run.id);
  assert.deepEqual(events.map((event) => event.sequence), [1, 2, 3]);
  assert.deepEqual(events.map((event) => event.type), ["run.created", "run.started", "run.succeeded"]);
  const stored = await store.getRun(run.id);
  assert.equal(stored?.status, "succeeded");
  events.push(events[0]);
  assert.equal((await store.listEvents(run.id)).length, 3, "returned event list must be a defensive copy");

  const idempotentStore = new InMemoryRunStore();
  const idempotentRun = await idempotentStore.createRun({ projectId, botId, request: { objective: "replay", input: {} } });
  const first = await idempotentStore.transition(idempotentRun.id, "start", { idempotencyKey: "start-1" });
  const replay = await idempotentStore.transition(idempotentRun.id, "start", { idempotencyKey: "start-1" });
  assert.deepEqual(replay, first);
  assert.equal((await idempotentStore.listEvents(idempotentRun.id)).length, 2);

  const boundedStore = new InMemoryRunStore();
  const boundedRun = await boundedStore.createRun({
    projectId,
    botId,
    request: { objective: "bounded retry", input: {}, retryPolicy: { maxRetries: 2 } },
  });
  await boundedStore.transition(boundedRun.id, "start");
  await boundedStore.transition(boundedRun.id, "fail", { error: { code: "TEMP", message: "temporary", retryable: true } });
  const retryOne = await boundedStore.transition(boundedRun.id, "retry", { retry: { attempt: 99, maxRetries: 99, mode: "manual", reasonClass: "manual" } });
  assert.equal((retryOne.event.data.retry as any)?.attempt, 1, "the store owns the canonical attempt number");
  assert.equal((retryOne.event.data.retry as any)?.maxRetries, 2);
  await boundedStore.transition(boundedRun.id, "start");
  await boundedStore.transition(boundedRun.id, "fail", { error: { code: "TEMP", message: "temporary", retryable: true } });
  const retryTwo = await boundedStore.transition(boundedRun.id, "retry");
  assert.equal((retryTwo.event.data.retry as any)?.attempt, 2);
  await boundedStore.transition(boundedRun.id, "start");
  await boundedStore.transition(boundedRun.id, "fail", { error: { code: "TEMP", message: "temporary", retryable: true } });
  await assert.rejects(() => boundedStore.transition(boundedRun.id, "retry"), RetryBudgetExceededError);
  assert.equal((await boundedStore.listEvents(boundedRun.id)).filter((event) => event.type === "run.retry_requested").length, 2);
}

test("core state machine and in-memory event store", async () => {
  await runCoreTests();
});
