import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile, appendFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cancelCodexRun, createRuntimeRun, executeCodexRun, runtimeStore, snapshot as coreSnapshot } from './runtime.ts';
import { runProductBuilder } from '../../../packages/workflow/src/index.ts';
import { checkpointProductBuilderResult, defaultProductBuilderContinuityStores } from './product-builder-continuity.ts';

type Json = Record<string, unknown> | unknown[];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const fixturePath = path.join(root, 'fixtures/demo-project.json');
const dataDir = path.join(root, 'data');
const eventsPath = path.join(dataDir, 'events.jsonl');
const port = Number(process.env.PORT ?? 4310);

type RequestLike = { method?: string; url?: string; headers: Record<string, string | undefined> } & AsyncIterable<Buffer | string>;
type ResponseLike = { writeHead(status: number, headers?: Record<string, string>): void; end(chunk?: string): void };

async function loadFixture() {
  return JSON.parse(await readFile(fixturePath, 'utf8')) as any;
}
async function writeEvent(event: Record<string, unknown>) {
  await mkdir(dataDir, { recursive: true });
  await appendFile(eventsPath, `${JSON.stringify(event)}\n`, 'utf8');
}
function send(res: ResponseLike, status: number, body: Json) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(body));
}
async function body(req: AsyncIterable<Buffer | string>) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
}
function codexProbe(): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const child = spawn(process.env.CODEX_BIN ?? 'codex', ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => resolve({ status: 'unavailable', reason: error.message, harness: 'codex-cli' }));
    child.on('close', (code) => resolve({ status: code === 0 ? 'available' : 'error', version: stdout.trim(), detail: stderr.trim(), harness: 'codex-cli', role: 'execution_agent' }));
  });
}
function toUiSnapshot(fixture: any) {
  return {
    projects: [{ id: fixture.project.id, name: fixture.project.name, description: fixture.project.description, updatedAt: '刚刚', botCount: fixture.bots.length, activeRun: fixture.run.goal }],
    bots: fixture.bots.map((bot: any, index: number) => ({
      id: bot.id, name: bot.name, role: bot.role, initials: bot.name.slice(0, 1),
      color: ['#5c5ae8', '#099d82', '#3478c8', '#ca568a'][index % 4], status: index === 0 ? '运行中' : '待机',
      provider: bot.provider === 'fixture' ? 'Fixture（可追溯演示）' : bot.provider, permission: bot.permission === 'workspace_write' ? '工作区写入' : '只读', skills: ['结构化交接', '来源审计'],
    })),
    run: { id: fixture.run.id, title: fixture.run.goal, status: '已完成', startedAt: '今天 18:42', elapsed: '05s', progress: 100,
      events: fixture.run.events.map((item: any, index: number) => ({ id: item.id, label: item.summary, detail: item.summary, time: item.at.slice(11, 19), kind: index === fixture.run.events.length - 1 ? 'done' : 'done', bot: 'Product Builder' })) },
    artifacts: fixture.run.artifacts.map((item: any) => ({ id: item.id, name: `${item.title}.md`, type: 'MD', meta: item.excerpt, status: '已生成' })),
    provider: { name: 'Fixture Adapter', model: fixture.run.provider.model, authMode: '本地 Fixture', billingSource: '本地', healthy: true, latency: '确定性' },
  };
}

export async function handleRequest(req: RequestLike, res: ResponseLike) {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
    const fixture = await loadFixture();
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' }); return res.end(); }
    if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true, service: 'local-agent-workspace', mode: 'fixture-first' });
    if (req.method === 'GET' && url.pathname === '/api/workspace') return send(res, 200, fixture);
    if (req.method === 'GET' && url.pathname === '/api/ui-snapshot') return send(res, 200, toUiSnapshot(fixture));
    if (req.method === 'GET' && url.pathname === '/api/core/snapshot') return send(res, 200, await coreSnapshot());
    if (req.method === 'GET' && url.pathname === '/api/core/runs') return send(res, 200, { runs: await runtimeStore.listRuns() });
    if (req.method === 'POST' && url.pathname === '/api/product-builder/preview') {
      const input = await body(req);
      const builderResult = runProductBuilder({ projectId: fixture.project.id as any, runId: fixture.run.id, idea: String(input.idea ?? fixture.run.goal), user: input.user ? String(input.user) : undefined });
      const stores = await defaultProductBuilderContinuityStores(dataDir);
      let continuity;
      try {
        continuity = await checkpointProductBuilderResult(
          { projectId: fixture.project.id as any, runId: fixture.run.id as any, idea: String(input.idea ?? fixture.run.goal) },
          builderResult,
          stores,
        );
      } finally {
        stores.close?.();
      }
      return send(res, 200, {
        ...builderResult,
        continuity: {
          createdCheckpoints: continuity.createdCheckpoints,
          skippedCheckpoints: continuity.skippedCheckpoints,
          createdSnapshots: continuity.createdSnapshots,
          latestSnapshotId: continuity.latestSnapshot?.id ?? null,
          persistence: stores.persistence ?? null,
        },
      });
    }
    if (req.method === 'GET' && url.pathname === '/api/provider/codex-probe') return send(res, 200, await codexProbe());
    if (req.method === 'POST' && url.pathname === '/api/provider/codex-run') {
      const input = await body(req);
      const result = await executeCodexRun(
        String(input.objective ?? input.goal ?? '用 Codex 评估一个产品想法'),
        (input.input ?? { idea: input.idea ?? input.goal ?? '' }) as any,
      );
      return send(res, result.run.status === 'succeeded' ? 200 : 502, result as any);
    }
    if (req.method === 'GET' && url.pathname === '/api/runs/run-fixture-001/events') return send(res, 200, { runId: fixture.run.id, events: fixture.run.events });
    if (req.method === 'POST' && url.pathname === '/api/runs') {
      const input = await body(req);
      const coreRun = await createRuntimeRun(String(input.goal ?? '未命名目标'));
      const id = `run-${randomUUID()}`;
      const event = { id: randomUUID(), type: 'run.created', at: new Date().toISOString(), runId: id, summary: `创建运行：${String(input.goal ?? '未命名目标')}` };
      await writeEvent(event);
      return send(res, 201, { id, coreRun: coreRun.run, status: 'queued', goal: input.goal ?? '', provider: input.provider ?? 'fixture', events: [event, coreRun.event] });
    }
    if (req.method === 'POST' && /^\/api\/runs\/[^/]+\/cancel$/.test(url.pathname)) {
      const runId = url.pathname.split('/')[3];
      const cancellation = await cancelCodexRun(runId);
      if (cancellation) return send(res, 200, cancellation as any);
      const event = { id: randomUUID(), type: 'run.cancelled', at: new Date().toISOString(), runId, summary: '用户取消运行' };
      await writeEvent(event);
      return send(res, 200, { runId, status: 'cancelled', event });
    }
    if (req.method === 'POST' && /^\/api\/runs\/[^/]+\/(approve|retry)$/.test(url.pathname)) {
      const parts = url.pathname.split('/');
      const runId = parts[3];
      const action = parts[4];
      const event = { id: randomUUID(), type: action === 'approve' ? 'approval.resolved' : 'run.retry_requested', at: new Date().toISOString(), runId, summary: action === 'approve' ? '用户确认继续' : '用户请求重试' };
      await writeEvent(event);
      return send(res, 200, { ok: true, runId, action, event });
    }
    send(res, 404, { error: 'not_found', path: url.pathname });
  } catch (error) {
    send(res, 500, { error: 'server_error', message: error instanceof Error ? error.message : String(error) });
  }
}

export function startServer(listenPort = port) {
  const server = createServer(handleRequest as (req: IncomingMessage, res: ServerResponse) => void);
  server.listen(listenPort, '127.0.0.1', () => console.log(`Local Agent Workspace server listening at http://127.0.0.1:${listenPort}`));
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) startServer();
