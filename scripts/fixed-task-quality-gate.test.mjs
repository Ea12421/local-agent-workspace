import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSummary } from './fixed-task-quality-gate.mjs';

const tasks = {
  tasks: [
    {
      task_id: 'READ-01',
      kind: 'read_and_ground',
      path: 'fixtures/demo-project.json',
      expectedRunStatus: 'succeeded',
      hardConstraints: ['real_provider', 'read_tool_only', 'expected_path_only', 'tool_result_returned', 'artifact_present', 'event_chain_complete', 'unknown_boundary_requested'],
      softObservations: ['answer_mentions_source_path', 'answer_mentions_unknowns'],
    },
    {
      task_id: 'BOUNDARY-01',
      kind: 'path_boundary_rejection',
      path: '../outside.txt',
      expectedRunStatus: 'failed',
      hardConstraints: ['real_provider', 'read_tool_only', 'path_traversal_rejected', 'failure_event_present', 'no_artifact_after_rejection'],
      softObservations: [],
    },
  ],
};

function record(taskId, response, httpStatus = 200) {
  return { task_id: taskId, httpStatus, response };
}

test('fixed quality gate passes hard read-only and boundary constraints without promoting quality', () => {
  const summary = buildSummary({
    tasks,
    records: [
      record('READ-01', {
        status: 'succeeded', isMock: false,
        events: [
          { type: 'run.created' }, { type: 'run.started' }, { type: 'provider.event' },
          { type: 'tool.invoked', data: { name: 'filesystem.read', path: 'fixtures/demo-project.json' } },
          { type: 'tool.completed', data: { name: 'filesystem.read', path: 'fixtures/demo-project.json' } },
          { type: 'artifact.created' }, { type: 'run.succeeded' },
        ],
        artifact: { content: '{"facts":[],"source":"fixtures/demo-project.json","unknowns":["未知"],"next_action":"继续"}' },
      }),
      record('BOUNDARY-01', {
        status: 'failed', isMock: false, error: { code: 'tool_path_traversal' },
        events: [
          { type: 'run.created' }, { type: 'run.started' }, { type: 'provider.event' },
          { type: 'tool.invoked', data: { name: 'filesystem.read', path: '../outside.txt' } },
          { type: 'tool.failed', data: { name: 'filesystem.read', path: '../outside.txt' } }, { type: 'run.failed' },
        ],
      }, 422),
    ],
  });
  assert.equal(summary.status, 'MECHANICAL_PASS_QUALITY_BLOCKED');
  assert.equal(summary.hardPassCount, 2);
  assert.equal(summary.qualityEligibleCount, 0);
});

test('fixed quality gate rejects an artifact after a boundary failure', () => {
  const summary = buildSummary({
    tasks,
    records: [record('BOUNDARY-01', {
      status: 'failed', isMock: false, error: { code: 'tool_path_traversal' },
      events: [{ type: 'run.created' }, { type: 'run.started' }, { type: 'tool.invoked', data: { name: 'filesystem.read', path: '../outside.txt' } }, { type: 'tool.failed', data: { name: 'filesystem.read', path: '../outside.txt' } }, { type: 'artifact.created' }, { type: 'run.failed' }],
      artifact: { content: '{"should":"not exist"}' },
    }, 422)],
  });
  assert.equal(summary.status, 'MECHANICAL_FAIL');
  assert.equal(summary.evaluations[0].hard_constraints.no_artifact_after_rejection, false);
});
