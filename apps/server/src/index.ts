import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRunEvent } from '../../../packages/core/src/index.ts';
import { cancelCodexRun, createRuntimeRun, executeCodexRun, runtimeStore, snapshot as coreSnapshot } from './runtime.ts';
import { runProductBuilder } from '../../../packages/workflow/src/index.ts';
import { checkpointProductBuilderResult, defaultProductBuilderContinuityStores } from './product-builder-continuity.ts';

type Json = Record<string, unknown> | unknown[];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const fixturePath = path.join(root, 'fixtures/demo-project.json');
const dataDir = path.join(root, 'data');
const port = Number(process.env.PORT ?? 4310);

type RequestLike = { method?: string; url?: string; headers: Record<string, string | undefined> } & AsyncIterable<Buffer | string>;
type ResponseLike = { writeHead(status: number, headers?: Record<string, string>): void; end(chunk?: string): void };

async function loadFixture() {
  return JSON.parse(await readFile(fixturePath, 'utf8')) as any;
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
    const entityMatch = url.pathname.match(/^\/api\/persistence\/(projects|skills|bots)(?:\/([^/]+))?$/);
    if (entityMatch) {
      const entity = entityMatch[1];
      const entityId = entityMatch[2];
      const stores = await defaultProductBuilderContinuityStores(dataDir);
      try {
        if (!stores.entityStore) return send(res, 503, { error: 'sqlite_entity_store_unavailable', reason: 'Entity writes require the SQLite operational backend.' });
        const input = ['POST', 'PATCH'].includes(req.method ?? '') ? await body(req) : {};
        const now = new Date().toISOString();
        if (entity === 'projects') {
          if (req.method === 'GET') {
            const project = entityId ? stores.entityStore.getProject(entityId) : undefined;
            if (entityId && !project) return send(res, 404, { error: 'project_not_found', id: entityId });
            return send(res, 200, (project ?? stores.entityStore.listProjects()) as any);
          }
          if (req.method === 'POST') {
            if (!input.name || !input.workspacePath) return send(res, 400, { error: 'project_name_and_workspacePath_required' });
            const project = { id: String(input.id ?? `project-${randomUUID()}`), name: String(input.name), ...(input.description ? { description: String(input.description) } : {}), workspacePath: String(input.workspacePath), createdAt: now, updatedAt: now } as any;
            stores.entityStore.saveProject(project);
            return send(res, 201, project);
          }
          if (req.method === 'PATCH' && entityId) {
            const existing = stores.entityStore.getProject(entityId);
            if (!existing) return send(res, 404, { error: 'project_not_found', id: entityId });
            const project = { ...existing, ...input, id: existing.id, updatedAt: now } as any;
            stores.entityStore.saveProject(project);
            return send(res, 200, project);
          }
        }
        if (entity === 'skills') {
          if (req.method === 'GET') {
            const skill = entityId ? stores.entityStore.getSkill(entityId) : undefined;
            if (entityId && !skill) return send(res, 404, { error: 'skill_not_found', id: entityId });
            return send(res, 200, (skill ?? stores.entityStore.listSkills()) as any);
          }
          if (req.method === 'POST') {
            if (!input.name || !input.description || !input.version || !input.instructions) return send(res, 400, { error: 'skill_name_description_version_instructions_required' });
            const skill = { id: String(input.id ?? `skill-${randomUUID()}`), name: String(input.name), description: String(input.description), version: String(input.version), instructions: String(input.instructions), ...(input.inputSchema ? { inputSchema: input.inputSchema } : {}), ...(input.outputSchema ? { outputSchema: input.outputSchema } : {}), enabled: input.enabled !== false } as any;
            stores.entityStore.saveSkill(skill);
            return send(res, 201, skill);
          }
          if (req.method === 'PATCH' && entityId) {
            const existing = stores.entityStore.getSkill(entityId);
            if (!existing) return send(res, 404, { error: 'skill_not_found', id: entityId });
            const skill = { ...existing, ...input, id: existing.id } as any;
            stores.entityStore.saveSkill(skill);
            return send(res, 200, skill);
          }
        }
        if (entity === 'bots') {
          if (req.method === 'GET') {
            const bot = entityId ? stores.entityStore.getBotProfile(entityId) : undefined;
            if (entityId && !bot) return send(res, 404, { error: 'bot_not_found', id: entityId });
            return send(res, 200, (bot ?? stores.entityStore.listBotProfiles(url.searchParams.get('projectId') ?? undefined)) as any);
          }
          if (req.method === 'POST') {
            const required = ['projectId', 'name', 'description', 'responsibility', 'inputSchema', 'outputSchema', 'skillIds', 'toolPolicy', 'providerPolicy', 'memoryPolicy', 'approvalPolicy'];
            if (required.some((key) => input[key] === undefined)) return send(res, 400, { error: 'bot_profile_fields_required', fields: required });
            const bot = { id: String(input.id ?? `bot-${randomUUID()}`), projectId: String(input.projectId), name: String(input.name), description: String(input.description), responsibility: String(input.responsibility), inputSchema: input.inputSchema, outputSchema: input.outputSchema, skillIds: input.skillIds, toolPolicy: input.toolPolicy, providerPolicy: input.providerPolicy, memoryPolicy: input.memoryPolicy, approvalPolicy: input.approvalPolicy, enabled: input.enabled !== false, createdAt: now, updatedAt: now } as any;
            stores.entityStore.saveBotProfile(bot);
            return send(res, 201, bot);
          }
          if (req.method === 'PATCH' && entityId) {
            const existing = stores.entityStore.getBotProfile(entityId);
            if (!existing) return send(res, 404, { error: 'bot_not_found', id: entityId });
            const bot = { ...existing, ...input, id: existing.id, projectId: existing.projectId, createdAt: existing.createdAt, updatedAt: now } as any;
            stores.entityStore.saveBotProfile(bot);
            return send(res, 200, bot);
          }
        }
        return send(res, 405, { error: 'method_not_allowed', entity, id: entityId ?? null });
      } finally {
        stores.close?.();
      }
    }
    if (req.method === 'GET' && url.pathname === '/api/persistence/entities') {
      const stores = await defaultProductBuilderContinuityStores(dataDir);
      try {
        const projectId = url.searchParams.get('projectId') ?? undefined;
        return send(res, 200, {
          projects: stores.entityStore?.listProjects() ?? [],
          bots: stores.entityStore?.listBotProfiles(projectId) ?? [],
          skills: stores.entityStore?.listSkills() ?? [],
          handoffs: stores.entityStore?.listHandoffs() ?? [],
          approvals: stores.entityStore?.listApprovals(projectId) ?? [],
          sources: stores.entityStore?.listSources(projectId) ?? [],
          artifacts: stores.entityStore?.listArtifacts(projectId) ?? [],
          memories: stores.entityStore?.listMemories(projectId) ?? [],
          receipts: stores.entityStore?.listReceipts() ?? [],
        });
      } finally {
        stores.close?.();
      }
    }
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
      return send(res, 201, { id: coreRun.run.id, coreRun: coreRun.run, status: coreRun.run.status, goal: input.goal ?? '', provider: input.provider ?? 'fixture', events: [coreRun.event] });
    }
    if (req.method === 'POST' && /^\/api\/runs\/[^/]+\/cancel$/.test(url.pathname)) {
      const runId = url.pathname.split('/')[3];
      const cancellation = await cancelCodexRun(runId);
      if (!cancellation) return send(res, 404, { error: 'run_not_found', runId });
      return send(res, 200, cancellation as any);
    }
    if (req.method === 'POST' && /^\/api\/runs\/[^/]+\/(approve|retry)$/.test(url.pathname)) {
      const parts = url.pathname.split('/');
      const runId = parts[3];
      const action = parts[4];
      if (action === 'retry') {
        const current = await runtimeStore.getRun(runId as any);
        if (!current) return send(res, 404, { error: 'run_not_found', runId });
        try {
          const transition = await runtimeStore.transition(runId as any, 'retry', { actor: { type: 'user' }, reason: '用户请求重试', idempotencyKey: `retry:${runId}` });
          return send(res, 200, { ok: true, runId, action, run: transition.run, event: transition.event });
        } catch (error) {
          if (error instanceof Error && error.name === 'InvalidRunTransitionError') return send(res, 409, { error: 'invalid_run_transition', runId, action, status: current.status, message: error.message });
          throw error;
        }
      }
      let approvalRowsUpdated = 0;
      let event: unknown = null;
      if (action === 'approve') {
        const stores = await defaultProductBuilderContinuityStores(dataDir);
        try {
          approvalRowsUpdated = stores.entityStore?.resolveApproval(runId, 'approved', 'user', 'HTTP approval route') ?? 0;
          if (approvalRowsUpdated > 0) {
            const events = (await stores.eventLog.readAll()).filter((item) => item.runId === runId);
            event = createRunEvent(runId as any, 'approval.resolved', { approvalRowsUpdated, decision: 'approved' }, events.length + 1, { type: 'user' });
            await stores.eventLog.append(event as any);
          }
        }
        finally { stores.close?.(); }
      }
      return send(res, 200, { ok: true, runId, action, approvalRowsUpdated, event });
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
