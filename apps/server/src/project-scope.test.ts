import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(os.tmpdir(), 'local-agent-workspace-project-scope-'));
const projectAPath = await mkdtemp(path.join(os.tmpdir(), 'local-agent-workspace-project-a-'));
const projectBPath = await mkdtemp(path.join(os.tmpdir(), 'local-agent-workspace-project-b-'));
process.env.AGENT_WORKSPACE_DATA_DIR = dataDir;
process.env.AGENT_WORKSPACE_DB = path.join(dataDir, 'workspace.db');
delete process.env.AGENT_WORKSPACE_PROJECT_ROOT;

const { handleRequest } = await import('./index.ts');
const { runtimeStore } = await import('./runtime.ts');

test.after(async () => {
  delete process.env.AGENT_WORKSPACE_DATA_DIR;
  delete process.env.AGENT_WORKSPACE_DB;
  await Promise.all([
    rm(dataDir, { recursive: true, force: true }),
    rm(projectAPath, { recursive: true, force: true }),
    rm(projectBPath, { recursive: true, force: true }),
  ]);
});

type Capture = { status?: number; body?: any };
function request(method: string, url: string, payload?: unknown) {
  const encoded = payload === undefined ? undefined : Buffer.from(JSON.stringify(payload));
  return {
    method,
    url,
    headers: { host: '127.0.0.1' },
    async *[Symbol.asyncIterator]() { if (encoded) yield encoded; },
  };
}
async function call(method: string, url: string, payload?: unknown): Promise<Capture> {
  const capture: Capture = {};
  await handleRequest(request(method, url, payload), {
    writeHead(status) { capture.status = status; },
    end(value) { capture.body = value ? JSON.parse(value) : undefined; },
  });
  return capture;
}

test('POST /api/runs uses the selected project workspace and rejects unknown projects', async () => {
  await writeFile(path.join(projectAPath, 'marker.txt'), 'PROJECT-A-MARKER');
  await writeFile(path.join(projectBPath, 'marker.txt'), 'PROJECT-B-MARKER');
  assert.equal((await call('POST', '/api/persistence/projects', { id: 'project-scope-a', name: 'Scope A', workspacePath: projectAPath })).status, 201);
  assert.equal((await call('POST', '/api/persistence/projects', { id: 'project-scope-b', name: 'Scope B', workspacePath: projectBPath })).status, 201);

  const runAResponse = await call('POST', '/api/runs', {
    provider: 'tool-local',
    projectId: 'project-scope-a',
    goal: '读取项目 A 标记',
    path: 'marker.txt',
  });
  assert.equal(runAResponse.status, 200);
  assert.equal(runAResponse.body.run.projectId, 'project-scope-a');
  assert.equal(runAResponse.body.output.content, 'PROJECT-A-MARKER');

  const runBResponse = await call('POST', '/api/runs', {
    provider: 'tool-local',
    projectId: 'project-scope-b',
    goal: '读取项目 B 标记',
    path: 'marker.txt',
  });
  assert.equal(runBResponse.status, 200);
  assert.equal(runBResponse.body.run.projectId, 'project-scope-b');
  assert.equal(runBResponse.body.output.content, 'PROJECT-B-MARKER');

  const runsA = await call('GET', '/api/core/runs?projectId=project-scope-a');
  const runsB = await call('GET', '/api/core/runs?projectId=project-scope-b');
  assert.equal(runsA.status, 200);
  assert.equal(runsB.status, 200);
  assert.ok(runsA.body.runs.some((run: any) => run.id === runAResponse.body.runId));
  assert.equal(runsA.body.runs.some((run: any) => run.id === runBResponse.body.runId), false);
  assert.ok(runsB.body.runs.some((run: any) => run.id === runBResponse.body.runId));

  const preview = await call('POST', '/api/product-builder/preview', {
    projectId: 'project-scope-b',
    idea: '为项目 B 生成产品草稿',
    user: '独立开发者',
  });
  assert.equal(preview.status, 200);
  assert.equal(preview.body.continuity.persistedState.projectId, 'project-scope-b');
  assert.ok(preview.body.artifacts.every((artifact: any) => artifact.projectId === 'project-scope-b'));

  const beforeUnknownCount = (await runtimeStore.listRuns('project-scope-a')).length + (await runtimeStore.listRuns('project-scope-b')).length;
  const unknown = await call('POST', '/api/runs', { provider: 'tool-local', projectId: 'project-unknown', goal: '不应创建运行', path: 'marker.txt' });
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.error, 'project_not_found');
  const afterUnknownCount = (await runtimeStore.listRuns('project-scope-a')).length + (await runtimeStore.listRuns('project-scope-b')).length;
  assert.equal(afterUnknownCount, beforeUnknownCount);
});
