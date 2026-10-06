import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { access, readFile, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyRetryReason, createApprovalRequestId, DEFAULT_MAX_RETRIES, createRunEvent, IMPROVEMENT_TARGETS, maxRetriesForRun, RetryBudgetExceededError, retryAttemptCount, type ApprovalRequest, type BotProfile, type BotId, type ProjectId, type ImprovementTarget, type ProviderConnection, type ProjectProviderBinding, type Session, type SessionMessage, type JsonObject, type ProviderIdentity, type RunEvent } from '../../../packages/core/src/index.ts';
import { cancelCodexRun, cancelControlledCommandRun, createControlledCommandRun, createRuntimeRun, executeCodexRun, executeControlledCommandRun, executeDeepSeekProductBuilderDraft, executeDeepSeekToolLoopRun, executeFixtureToolLoop, executeFixtureToolRun, executeLocalFileReadRun, executeLocalGitDiffStatRun, executeLocalGitStatusRun, executeLocalToolLoopRun, listControlledCommandProfiles, previewControlledCommand, projectWorkspaceRoot, resumeFixtureToolLoop, resumePersistedFixtureToolLoop, runtimeStore, snapshot as coreSnapshot } from './runtime.ts';
import { runProductBuilder } from '../../../packages/workflow/src/index.ts';
import { checkpointProductBuilderResult, defaultProductBuilderContinuityStores, readLatestProductBuilderState, reconcileProductBuilderRelease, resolveProductBuilderClarification } from './product-builder-continuity.ts';
import type { ProviderReceipt } from './persistence.ts';
import { improvementApprovals, improvementArtifacts, improvementEvaluationBundle, readImprovementProjection, rollbackImprovement, startImprovementRun } from './improvement-runtime.ts';
import { SqliteMemoryAdapter } from './memory-adapter.ts';
import { ProviderResolverError, resolveProviderBinding } from './provider-resolver.ts';

type Json = Record<string, unknown> | unknown[];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const fixturePath = path.join(root, 'fixtures/demo-project.json');
const webDistPath = path.join(root, 'apps/web/dist');
const dataDir = path.resolve(process.env.AGENT_WORKSPACE_DATA_DIR ?? path.join(root, 'data'));
const port = Number(process.env.PORT ?? 4310);

type RequestLike = { method?: string; url?: string; headers: Record<string, string | undefined> } & AsyncIterable<Buffer | string>;
type ResponseLike = { writeHead(status: number, headers?: Record<string, string>): void; end(chunk?: string): void; correlationId?: string };

function webContentType(filePath: string): string {
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  return 'text/html; charset=utf-8';
}

async function serveWeb(res: ResponseLike, pathname: string): Promise<boolean> {
  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const candidate = path.resolve(webDistPath, requested);
  const insideWebDist = candidate === webDistPath || candidate.startsWith(`${webDistPath}${path.sep}`);
  if (!insideWebDist) return false;
  try {
    const content = await readFile(candidate);
    res.writeHead(200, { 'content-type': webContentType(candidate), 'cache-control': 'no-cache' });
    res.end(content.toString('utf8'));
    return true;
  } catch {
    if (pathname.startsWith('/assets/') || path.extname(pathname)) return false;
    try {
      const index = await readFile(path.join(webDistPath, 'index.html'));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
      res.end(index.toString('utf8'));
      return true;
    } catch {
      return false;
    }
  }
}

async function loadFixture() {
  return JSON.parse(await readFile(fixturePath, 'utf8')) as any;
}

async function projectScopeExists(projectId: string, fixtureProjectId: string): Promise<boolean> {
  if (projectId === fixtureProjectId) return true;
  const stores = await defaultProductBuilderContinuityStores(dataDir);
  try {
    return Boolean(stores.entityStore?.getProject(projectId));
  } finally {
    stores.close?.();
  }
}

const BOT_POLICY_FIELDS = ['toolPolicy', 'providerPolicy', 'memoryPolicy', 'approvalPolicy'] as const;

function botPolicyPatch(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(BOT_POLICY_FIELDS.filter((field) => input[field] !== undefined).map((field) => [field, input[field]]));
}

function hasBotPolicyChange(existing: BotProfile, input: Record<string, unknown>): boolean {
  return BOT_POLICY_FIELDS.some((field) => input[field] !== undefined && JSON.stringify(input[field]) !== JSON.stringify(existing[field]));
}

function hasUnsafeInitialBotPolicy(input: Record<string, unknown>): boolean {
  const toolPolicy = input.toolPolicy && typeof input.toolPolicy === 'object' ? input.toolPolicy as Record<string, unknown> : undefined;
  return Boolean(toolPolicy?.permissionTier && toolPolicy.permissionTier !== 'read_only');
}

function parseSkillIds(value: unknown): { ids?: string[]; error?: string } {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string' && item.trim().length > 0)) {
    return { error: 'skill_ids_must_be_string_array' };
  }
  const ids = [...new Set(value.map((item) => String(item).trim()))];
  return { ids };
}

function validateSkillIds(entityStore: NonNullable<Awaited<ReturnType<typeof defaultProductBuilderContinuityStores>>['entityStore']>, ids: string[]): string | undefined {
  const missing = ids.filter((id) => !entityStore.getSkill(id));
  return missing.length ? `unknown_skill_ids:${missing.join(',')}` : undefined;
}

function send(res: ResponseLike, status: number, body: Json) {
  const correlationId = res.correlationId;
  const responseBody = status >= 400 && correlationId && body && !Array.isArray(body) && typeof body === 'object'
    ? { ...(body as Record<string, unknown>), correlationId }
    : body;
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', ...(correlationId ? { 'x-correlation-id': correlationId } : {}) });
  res.end(JSON.stringify(responseBody));
}

function requestCorrelationId(value: string | undefined): string {
  return value && /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : `corr_${randomUUID()}`;
}

function codexAssistantText(events: RunEvent[] | undefined): string | undefined {
  const message = [...(events ?? [])].reverse().find((event) => {
    const stream = (event.data as any)?.stream;
    return stream?.type === 'item.completed' && stream.item?.type === 'agent_message' && typeof stream.item.text === 'string' && stream.item.text.trim();
  });
  const text = (message?.data as any)?.stream?.item?.text;
  return typeof text === 'string' && text.trim() ? text.trim() : undefined;
}

function sessionRunAssistantContent(run: { id: string; status: string; error?: { message?: unknown } }, providerEvents?: RunEvent[]): string {
  if (run.status === 'succeeded') return codexAssistantText(providerEvents) ?? `本地受控运行已完成。\nRun：${run.id}\n已留下 RunEvent 和可回放结果。`;
  if (run.status === 'waiting_user') return `运行等待确认。\nRun：${run.id}\n请先处理审批，再继续。`;
  if (run.status === 'failed' || run.status === 'cancelled') return `运行失败。\nRun：${run.id}\n${String(run.error?.message ?? '请查看运行记录。')}`;
  return `运行已创建。\nRun：${run.id}\n当前状态：${run.status}。`;
}

function runProviderIdentity(run: { result?: unknown }): ProviderIdentity | undefined {
  const provider = run.result && typeof run.result === 'object' && !Array.isArray(run.result)
    ? (run.result as Record<string, unknown>).provider
    : undefined;
  if (!provider || typeof provider !== 'object' || Array.isArray(provider)) return undefined;
  const candidate = provider as Record<string, unknown>;
  if (typeof candidate.harness !== 'string' || typeof candidate.provider !== 'string' || typeof candidate.model !== 'string') return undefined;
  if (!['api_key', 'subscription', 'cli', 'local', 'unknown'].includes(String(candidate.authMode))) return undefined;
  if (!['api', 'subscription', 'local', 'unknown'].includes(String(candidate.billingSource))) return undefined;
  if (typeof candidate.isMock !== 'boolean') return undefined;
  return {
    harness: candidate.harness,
    provider: candidate.provider,
    model: candidate.model,
    authMode: candidate.authMode as ProviderIdentity['authMode'],
    billingSource: candidate.billingSource as ProviderIdentity['billingSource'],
    isMock: candidate.isMock,
  };
}

async function reconcileSessionRuns(entityStore: NonNullable<Awaited<ReturnType<typeof defaultProductBuilderContinuityStores>>['entityStore']>, session: Session): Promise<void> {
  const runs = await runtimeStore.listRuns(session.projectId);
  for (const run of runs) {
    if (String(run.request.sessionId ?? '') !== String(session.id)) continue;
    const messageId = typeof run.request.metadata?.sessionMessageId === 'string' ? run.request.metadata.sessionMessageId : '';
    if (!messageId || !['succeeded', 'failed', 'cancelled', 'waiting_user'].includes(run.status)) continue;
    const events = await runtimeStore.listEvents(run.id);
    entityStore.reconcileSessionRun({ sessionId: String(session.id), projectId: String(session.projectId), messageId, runId: String(run.id), assistantContent: sessionRunAssistantContent(run, events), ...(runProviderIdentity(run) ? { provider: runProviderIdentity(run) } : {}) });
  }
}

function controlledCommandProfileView(profile: ReturnType<typeof listControlledCommandProfiles>[number]) {
  return {
    id: profile.id,
    label: profile.label,
    argv: [...profile.argv],
    timeoutMs: profile.timeoutMs,
    maxOutputBytes: profile.maxOutputBytes,
    declaredEffects: [...profile.declaredEffects],
    approvalRequired: true,
  };
}

/**
 * Expose only auditable model-response metadata to HTTP/UI consumers.
 * Raw output is deliberately excluded; the persisted receipt keeps a hash
 * reference and the run event endpoint remains the replay boundary.
 */
function providerModelReceiptView(item: ProviderReceipt, projectId?: string): Record<string, unknown> | null {
  const response = item.receipt as any;
  if (response?.schemaVersion !== 'provider.model-response.v1') return null;
  return {
    id: item.id,
    runId: item.runId,
    ...(item.segment === undefined ? {} : { segment: item.segment }),
    createdAt: item.createdAt,
    provider: item.provider,
    requestId: response.requestId ?? null,
    rawResponseRef: response.rawResponseRef ?? null,
    usage: response.usage ?? { source: 'unknown' },
    promptCache: response.promptCache ?? { status: 'unknown', providerReported: false },
    finishReason: response.finishReason ?? null,
    error: response.error ?? null,
    providerFields: response.providerFields ?? null,
    replayRef: `/api/core/runs/${encodeURIComponent(String(item.runId))}?${projectId ? `projectId=${encodeURIComponent(projectId)}&` : ''}receiptId=${encodeURIComponent(item.id)}`,
    eventsRef: `/api/runs/${encodeURIComponent(String(item.runId))}/events${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`,
  };
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

function runCodexHelp(args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.env.CODEX_BIN ?? 'codex', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => resolve({ code: null, stdout, stderr: `${stderr}${error.message}` }));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function codexEnvironmentDiagnostics(): Promise<Record<string, unknown>> {
  const [version, execHelp, appServerHelp] = await Promise.all([
    runCodexHelp(['--version']),
    runCodexHelp(['exec', '--help']),
    runCodexHelp(['app-server', '--help']),
  ]);
  const stateHome = process.env.CODEX_HOME ?? path.join(homedir(), '.codex');
  const stateDbPath = path.join(stateHome, 'state_5.sqlite');
  let stateDbExists = false;
  try { await stat(stateDbPath); stateDbExists = true; } catch { /* metadata probe only */ }
  const fileWritable = stateDbExists ? await access(stateDbPath, 2).then(() => true).catch(() => false) : false;
  const directoryWritable = await access(stateHome, 2).then(() => true).catch(() => false);
  const versionText = version.stdout.trim().split('\n').find((line) => line.includes('codex-cli')) ?? version.stdout.trim();
  const publicCli = version.code === 0;
  const status = !publicCli ? 'unavailable' : stateDbExists && !fileWritable && !directoryWritable ? 'blocked_environment' : 'available';
  return {
    status,
    harness: 'codex-cli',
    version: versionText,
    capabilities: {
      execJson: execHelp.code === 0 && execHelp.stdout.includes('--json'),
      resume: execHelp.code === 0 && execHelp.stdout.includes('resume'),
      appServer: appServerHelp.code === 0 && appServerHelp.stdout.includes('app-server'),
    },
    stateDb: {
      path: stateDbPath,
      exists: stateDbExists,
      fileWritable,
      directoryWritable,
    },
    ...(status === 'blocked_environment' ? { reason: 'Codex CLI 可见，但当前环境无法写入自身 state_5.sqlite 或 .codex 目录。' } : {}),
    ...(version.stderr.trim() ? { stderr: version.stderr.trim().slice(0, 500) } : {}),
  };
}
function toUiSnapshot(fixture: any, workspacePath: string) {
  return {
    projects: [{ id: fixture.project.id, name: fixture.project.name, description: fixture.project.description, workspacePath, updatedAt: '刚刚', botCount: fixture.bots.length, activeRun: fixture.run.goal }],
    bots: fixture.bots.map((bot: any, index: number) => ({
      id: bot.id, name: bot.name, role: bot.role, initials: bot.name.slice(0, 1),
      color: ['#5c5ae8', '#099d82', '#3478c8', '#ca568a'][index % 4], status: index === 0 ? '运行中' : '待机',
      provider: bot.provider === 'fixture' ? 'Fixture（可追溯演示）' : bot.provider,
      permission: bot.permission === 'full_access' ? '完全访问' : bot.permission === 'workspace_write' ? '工作区写入' : '只读',
      skills: ['结构化交接', '来源审计'],
    })),
    run: { id: fixture.run.id, title: fixture.run.goal, status: '已完成', startedAt: '今天 18:42', elapsed: '05s', progress: 100,
      events: fixture.run.events.map((item: any, index: number) => ({ id: item.id, label: item.summary, detail: item.summary, time: item.at.slice(11, 19), kind: index === fixture.run.events.length - 1 ? 'done' : 'done', bot: 'Product Builder' })) },
    artifacts: fixture.run.artifacts.map((item: any) => ({ id: item.id, name: `${item.title}.md`, type: 'MD', meta: item.excerpt, status: '已生成' })),
    provider: { name: 'Fixture Adapter', model: fixture.run.provider.model, authMode: '本地 Fixture', billingSource: '本地', healthy: true, latency: '确定性' },
  };
}

/**
 * Product Builder handoffs are persisted before the UI can query them by
 * project.  Seed only missing built-in profiles so the project-scoped handoff
 * query has an ownership anchor without overwriting user edits on later runs.
 */
function ensureFixtureProject(entityStore: NonNullable<Awaited<ReturnType<typeof defaultProductBuilderContinuityStores>>['entityStore']>, fixture: any, workspacePath: string): void {
  const projectId = String(fixture.project.id);
  if (!entityStore.getProject(projectId)) {
    const now = new Date().toISOString();
    entityStore.saveProject({
      id: projectId,
      name: String(fixture.project.name ?? 'AI 产品构建器'),
      description: String(fixture.project.description ?? '本地 Product Builder 项目'),
      workspacePath,
      createdAt: now,
      updatedAt: now,
    } as any);
  }
  ensureFixtureBotProfiles(entityStore, fixture, projectId);
}

function ensureFixtureBotProfiles(entityStore: NonNullable<Awaited<ReturnType<typeof defaultProductBuilderContinuityStores>>['entityStore']>, fixture: any, projectId: string): void {
  const now = new Date().toISOString();
  for (const fixtureBot of Array.isArray(fixture.bots) ? fixture.bots : []) {
    if (entityStore.getBotProfile(String(fixtureBot.id))) continue;
    const profile: BotProfile = {
      id: String(fixtureBot.id) as BotId,
      projectId: projectId as ProjectId,
      name: String(fixtureBot.name ?? fixtureBot.id),
      description: String(fixtureBot.role ?? '内置 Product Builder Bot'),
      responsibility: String(fixtureBot.role ?? '执行结构化 Product Builder 工作流'),
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      skillIds: [],
      toolPolicy: { permissionTier: 'read_only', allowedTools: [], approvalRequiredActions: [] },
      providerPolicy: { providerPreference: [String(fixtureBot.provider ?? 'fixture')], fallbackEnabled: false },
      memoryPolicy: { readScopes: ['project'], writeScopes: [], requireUserApprovalForWrites: true },
      approvalPolicy: { approvalRequiredActions: [], autoApproveReadOnly: true },
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };
    entityStore.saveBotProfile(profile);
  }
}

export async function handleRequest(req: RequestLike, res: ResponseLike) {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
    res.correlationId = requestCorrelationId(req.headers['x-correlation-id']);
    if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
      if (await serveWeb(res, url.pathname)) return;
    }
    const fixture = await loadFixture();
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS', 'access-control-allow-headers': 'content-type,x-correlation-id' }); return res.end(); }
    if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true, service: 'local-agent-workspace', mode: 'fixture-first' });
    if (req.method === 'GET' && url.pathname === '/api/workspace') return send(res, 200, fixture);
    if (req.method === 'GET' && url.pathname === '/api/ui-snapshot') {
      const requestedProjectId = url.searchParams.get('projectId')?.trim() || String(fixture.project.id);
      const stores = await defaultProductBuilderContinuityStores(dataDir);
      try {
        const persistedProjects = stores.entityStore?.listProjects() ?? [];
        const selectedProject = persistedProjects.find((item) => String(item.id) === requestedProjectId);
        if (requestedProjectId !== String(fixture.project.id) && !selectedProject) return send(res, 404, { error: 'project_not_found', projectId: requestedProjectId });
        const snapshot = toUiSnapshot(fixture, selectedProject?.workspacePath ?? projectWorkspaceRoot(requestedProjectId));
        if (selectedProject) {
          const projectBots = stores.entityStore?.listBotProfiles(requestedProjectId) ?? [];
          const projectBindings = stores.entityStore?.listProjectProviderBindings(requestedProjectId) ?? [];
          const primaryBinding = projectBindings.find((item) => item.role === 'primary' && item.enabled);
          const primaryConnection = primaryBinding ? stores.entityStore?.getProviderConnection(String(primaryBinding.connectionId)) : undefined;
          const mappedProjects = persistedProjects.map((item) => ({ id: String(item.id), name: item.name, description: item.description ?? '', workspacePath: item.workspacePath, updatedAt: item.updatedAt, botCount: stores.entityStore?.listBotProfiles(String(item.id)).length ?? 0, activeRun: undefined }));
          snapshot.projects = [mappedProjects.find((item) => item.id === requestedProjectId)!, ...mappedProjects.filter((item) => item.id !== requestedProjectId)];
          snapshot.bots = projectBots.map((bot, index) => ({ id: String(bot.id), name: bot.name, role: bot.responsibility, initials: bot.name.slice(0, 1), color: ['#5c5ae8', '#099d82', '#3478c8', '#ca568a'][index % 4], status: bot.enabled ? '待机' : '待机', provider: primaryConnection?.provider ?? String((bot.providerPolicy as any)?.providerPreference?.[0] ?? '未绑定'), permission: bot.toolPolicy.permissionTier === 'full_access' ? '完全访问' : bot.toolPolicy.permissionTier === 'workspace_write' ? '工作区写入' : '只读', skills: bot.skillIds.map(String), enabled: bot.enabled }));
          snapshot.run = { id: `run-empty-${requestedProjectId}`, title: '尚未开始运行', status: '已完成', startedAt: '—', elapsed: '—', progress: 0, events: [] };
          snapshot.artifacts = [];
          snapshot.provider = primaryBinding && primaryConnection
            ? { name: primaryConnection.provider === 'codex' ? 'Codex 执行器' : primaryConnection.provider === 'deepseek' ? 'DeepSeek API' : 'Fixture Adapter', model: primaryBinding.model, authMode: primaryConnection.authMode, billingSource: primaryConnection.billingSource, healthy: primaryConnection.status === 'available', latency: primaryConnection.status === 'available' ? '等待运行' : '需要检查' }
            : { name: '未配置 Provider', model: '—', authMode: '—', billingSource: '—', healthy: false, latency: '等待配置' };
        }
        return send(res, 200, snapshot as any);
      } finally { stores.close?.(); }
    }
    if (req.method === 'GET' && url.pathname === '/api/commands') {
      return send(res, 200, { commands: listControlledCommandProfiles().map(controlledCommandProfileView), policy: { permissionTier: 'read_only', allowedTools: ['command'], approvalRequiredActions: ['command.run'] } });
    }
    if (req.method === 'POST' && url.pathname === '/api/commands/preview') {
      const input = await body(req);
      const commandId = typeof input.commandId === 'string' ? input.commandId.trim() : '';
      if (!commandId) return send(res, 400, { error: 'command_id_required' });
      const projectScope = typeof input.projectId === 'string' && input.projectId.trim() ? input.projectId.trim() : String(fixture.project.id);
      if (!(await projectScopeExists(projectScope, String(fixture.project.id)))) return send(res, 404, { error: 'project_not_found', projectId: projectScope });
      const argv = Array.isArray(input.argv) && input.argv.every((item) => typeof item === 'string') ? input.argv as string[] : undefined;
      try {
        const preview = await previewControlledCommand(commandId, typeof input.requestId === 'string' ? input.requestId : `command-preview:${commandId}:${randomUUID()}`, argv, { projectId: projectScope as ProjectId });
        return send(res, 200, { ok: true, projectId: projectScope, profile: controlledCommandProfileView(preview.profile), receipt: preview.result.receipt, output: preview.result.output ?? null });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.startsWith('controlled_command_profile_not_found:')) return send(res, 404, { error: 'command_profile_not_found', commandId });
        return send(res, 422, { error: 'command_preview_failed', message });
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/commands/runs') {
      const input = await body(req);
      const commandId = typeof input.commandId === 'string' ? input.commandId.trim() : '';
      const objective = typeof input.objective === 'string' && input.objective.trim() ? input.objective.trim().slice(0, 500) : '';
      const projectScope = typeof input.projectId === 'string' && input.projectId.trim() ? input.projectId.trim() : String(fixture.project.id);
      if (!commandId) return send(res, 400, { error: 'command_id_required' });
      if (!objective) return send(res, 400, { error: 'objective_required' });
      if (!(await projectScopeExists(projectScope, String(fixture.project.id)))) return send(res, 404, { error: 'project_not_found', projectId: projectScope });
      const idempotencyKey = typeof input.idempotencyKey === 'string' && input.idempotencyKey.trim().length <= 200 ? input.idempotencyKey.trim() : undefined;
      try {
        const profile = listControlledCommandProfiles().find((item) => item.id === commandId);
        if (!profile) return send(res, 404, { error: 'command_profile_not_found', commandId });
        if (idempotencyKey) {
          const existing = (await runtimeStore.listRuns(projectScope)).find((item) => item.request.metadata?.provider === 'controlled-command' && item.request.metadata?.idempotencyKey === idempotencyKey);
          if (existing) {
            const existingStores = await defaultProductBuilderContinuityStores(dataDir);
            try {
              const approval = existingStores.entityStore?.listApprovals(projectScope).find((item) => String(item.runId) === String(existing.id) && item.metadata?.kind === 'controlled_command');
              return send(res, 200, { ok: true, idempotent: true, runId: existing.id, run: existing, status: existing.status, profile: controlledCommandProfileView(profile), approval: approval ?? null, events: await runtimeStore.listEvents(existing.id) });
            } finally { existingStores.close?.(); }
          }
        }
        const preview = await previewControlledCommand(commandId, `command-preview:${commandId}:${randomUUID()}`, undefined, { projectId: projectScope as ProjectId });
        const created = await createControlledCommandRun(objective, commandId, idempotencyKey, { projectId: projectScope as ProjectId });
        const approval: ApprovalRequest = {
          id: createApprovalRequestId(),
          projectId: projectScope as ProjectId,
          runId: created.run.id,
          action: profile.approvalAction,
          description: `${profile.label}：${profile.argv.join(' ')}。影响：${profile.declaredEffects.join('、')}。仅对本次 Run 生效。`,
          permissionTier: 'read_only',
          status: 'pending',
          requestedAt: new Date().toISOString(),
          metadata: { kind: 'controlled_command', commandId: profile.id, argv: [...profile.argv], declaredEffects: [...profile.declaredEffects], policyVersion: 1, approvalAction: profile.approvalAction, idempotencyKey: idempotencyKey ?? null },
        };
        const stores = await defaultProductBuilderContinuityStores(dataDir);
        try {
          if (!stores.entityStore) return send(res, 503, { error: 'sqlite_entity_store_unavailable', reason: 'Controlled command approval requires the SQLite operational backend.' });
          stores.entityStore.saveApprovalRequest(approval);
        } finally { stores.close?.(); }
        const events = await runtimeStore.listEvents(created.run.id);
        const approvalEvent = createRunEvent(created.run.id, 'approval.requested', { approvalId: approval.id, action: approval.action, description: approval.description, permissionTier: approval.permissionTier, commandId: profile.id, idempotencyKey: `approval:${approval.id}` }, events.length + 1, { type: 'system' });
        await runtimeStore.appendEvent(approvalEvent);
        return send(res, 202, { ok: true, idempotent: false, runId: created.run.id, run: await runtimeStore.getRun(created.run.id), status: 'waiting_user', profile: controlledCommandProfileView(profile), preview: { receipt: preview.result.receipt, output: preview.result.output ?? null }, approval, events: await runtimeStore.listEvents(created.run.id) });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.startsWith('controlled_command_profile_not_found:')) return send(res, 404, { error: 'command_profile_not_found', commandId });
        throw error;
      }
    }
    const controlledReplayMatch = url.pathname.match(/^\/api\/commands\/runs\/([^/]+)\/replay$/);
    if (req.method === 'POST' && controlledReplayMatch) {
      const runId = decodeURIComponent(controlledReplayMatch[1]);
      const projectScope = url.searchParams.get('projectId')?.trim() ?? String(fixture.project.id);
      const run = await runtimeStore.getRun(runId as any);
      if (!run || String(run.projectId) !== projectScope || run.request.metadata?.provider !== 'controlled-command') return send(res, 404, { error: 'controlled_command_run_not_found', runId });
      return send(res, 200, { ok: true, replayed: true, idempotent: true, run, events: await runtimeStore.listEvents(run.id) });
    }
    if (req.method === 'GET' && url.pathname === '/api/core/snapshot') return send(res, 200, await coreSnapshot());
    if (req.method === 'GET' && url.pathname === '/api/core/runs') {
      const projectId = url.searchParams.get('projectId')?.trim();
      if (!projectId) return send(res, 400, { error: 'project_id_required', resource: 'runs' });
      return send(res, 200, { projectId, runs: await runtimeStore.listRuns(projectId) });
    }
    const coreRunMatch = url.pathname.match(/^\/api\/core\/runs\/([^/]+)$/);
    if (req.method === 'GET' && coreRunMatch) {
      const runId = decodeURIComponent(coreRunMatch[1]);
      const run = await runtimeStore.getRun(runId as any);
      if (!run) return send(res, 404, { error: 'run_not_found', runId });
      const projectId = url.searchParams.get('projectId')?.trim();
      if (!projectId) return send(res, 400, { error: 'project_id_required', resource: 'run', runId });
      if (String(run.projectId) !== projectId) return send(res, 404, { error: 'run_not_found', runId });
      const stores = await defaultProductBuilderContinuityStores(dataDir);
      try {
        const continuityEvents = (await stores.eventLog.readAll()).filter((item) => item.runId === run.id) as any;
        const productBuilder = readLatestProductBuilderState(continuityEvents, run.id);
        const receipts = stores.entityStore?.listReceipts(run.id) ?? [];
        const modelReceipts = receipts.map((item) => providerModelReceiptView(item, projectId)).filter((item): item is Record<string, unknown> => Boolean(item));
        return send(res, 200, {
          run,
          events: await runtimeStore.listEvents(run.id),
          receipts,
          modelReceipts,
          modelReceipt: modelReceipts.at(-1) ?? null,
          productBuilder: productBuilder ?? null,
          artifactRelease: productBuilder?.artifactRelease ?? null,
          finalArtifactIds: productBuilder?.finalArtifactIds ?? [],
          conflicts: productBuilder?.conflicts ?? [],
          releaseBlockers: productBuilder?.releaseBlockers ?? [],
        });
      } finally {
        stores.close?.();
      }
    }
    const providerProbeMatch = url.pathname.match(/^\/api\/persistence\/provider-connections\/([^/]+)\/probe$/);
    if (req.method === 'POST' && providerProbeMatch) {
      const stores = await defaultProductBuilderContinuityStores(dataDir);
      try {
        if (!stores.entityStore) return send(res, 503, { error: 'sqlite_entity_store_unavailable', reason: 'Provider connection persistence requires SQLite.' });
        const id = decodeURIComponent(providerProbeMatch[1]);
        const existing = stores.entityStore.getProviderConnection(id);
        if (!existing) return send(res, 404, { error: 'provider_connection_not_found', id });
        const now = new Date().toISOString();
        if (existing.provider === 'fixture') {
          const updated = { ...existing, status: 'available' as const, lastProbeAt: now, updatedAt: now, capabilities: { ...(existing.capabilities ?? {}), probe: 'fixture-local' } };
          stores.entityStore.saveProviderConnection(updated);
          return send(res, 200, { ok: true, connection: updated, result: { status: 'available', reason: 'Fixture 本地连接可用。' } });
        }
        if (existing.provider === 'deepseek') {
          return send(res, 200, { ok: false, connection: existing, result: { status: 'unconfigured', reason: 'DeepSeek 探针不会读取或接收 Key；请在本机设置 Secret 引用后，显式运行一次 DeepSeek 任务。' } });
        }
        const diagnostics = await codexEnvironmentDiagnostics();
        const status = diagnostics.status === 'available' ? 'available' as const : diagnostics.status === 'blocked_environment' ? 'blocked' as const : 'error' as const;
        const updated = { ...existing, status, lastProbeAt: now, updatedAt: now, capabilities: { ...(existing.capabilities ?? {}), probe: diagnostics as JsonObject } };
        stores.entityStore.saveProviderConnection(updated);
        return send(res, 200, { ok: status === 'available', connection: updated, result: diagnostics });
      } finally { stores.close?.(); }
    }
    const providerConnectionMatch = url.pathname.match(/^\/api\/persistence\/provider-connections(?:\/([^/]+))?$/);
    if (providerConnectionMatch) {
      const stores = await defaultProductBuilderContinuityStores(dataDir);
      try {
        if (!stores.entityStore) return send(res, 503, { error: 'sqlite_entity_store_unavailable', reason: 'Provider connection persistence requires SQLite.' });
        const id = providerConnectionMatch[1] ? decodeURIComponent(providerConnectionMatch[1]) : undefined;
        if (req.method === 'GET') {
          const item = id ? stores.entityStore.getProviderConnection(id) : undefined;
          if (id && !item) return send(res, 404, { error: 'provider_connection_not_found', id });
          return send(res, 200, (item ?? stores.entityStore.listProviderConnections()) as any);
        }
        if (!['POST', 'PATCH'].includes(req.method ?? '')) return send(res, 405, { error: 'method_not_allowed' });
        const input = await body(req);
        const existing = id ? stores.entityStore.getProviderConnection(id) : undefined;
        if (id && !existing) return send(res, 404, { error: 'provider_connection_not_found', id });
        const secretRef = input.secretRef === undefined ? existing?.secretRef : input.secretRef;
        if (secretRef !== undefined && (!secretRef || typeof secretRef !== 'object')) return send(res, 400, { error: 'secret_ref_must_be_metadata_only' });
        const safeSecretRef = secretRef && typeof secretRef === 'object'
          ? (() => { const candidate = secretRef as Record<string, unknown>; return candidate.kind === 'env' && typeof candidate.name === 'string' ? { kind: 'env' as const, name: candidate.name } : candidate.kind === 'cli' && typeof candidate.profile === 'string' ? { kind: 'cli' as const, profile: candidate.profile } : undefined; })()
          : undefined;
        if (secretRef !== undefined && !safeSecretRef) return send(res, 400, { error: 'invalid_secret_ref', reason: '只允许 env.name 或 cli.profile 引用，不能提交 Key 原文。' });
        const now = new Date().toISOString();
        const item: ProviderConnection = {
          id: String(existing?.id ?? input.id ?? `connection-${randomUUID()}`) as any,
          label: String(input.label ?? existing?.label ?? ''),
          provider: String(input.provider ?? existing?.provider ?? 'fixture') as ProviderConnection['provider'],
          harness: String(input.harness ?? existing?.harness ?? 'fixture') as ProviderConnection['harness'],
          authMode: String(input.authMode ?? existing?.authMode ?? 'unknown') as ProviderConnection['authMode'],
          billingSource: String(input.billingSource ?? existing?.billingSource ?? 'unknown') as ProviderConnection['billingSource'],
          ...(safeSecretRef ? { secretRef: safeSecretRef as ProviderConnection['secretRef'] } : {}),
          status: String(input.status ?? existing?.status ?? 'unconfigured') as ProviderConnection['status'],
          ...(input.capabilities ?? existing?.capabilities ? { capabilities: (input.capabilities ?? existing?.capabilities) as any } : {}),
          ...(input.lastProbeAt ?? existing?.lastProbeAt ? { lastProbeAt: String(input.lastProbeAt ?? existing?.lastProbeAt) } : {}),
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        };
        if (!item.label) return send(res, 400, { error: 'provider_connection_label_required' });
        stores.entityStore.saveProviderConnection(item);
        return send(res, existing ? 200 : 201, item as any);
      } finally { stores.close?.(); }
    }

    const providerBindingMatch = url.pathname.match(/^\/api\/persistence\/provider-bindings(?:\/([^/]+))?$/);
    if (providerBindingMatch) {
      const stores = await defaultProductBuilderContinuityStores(dataDir);
      try {
        if (!stores.entityStore) return send(res, 503, { error: 'sqlite_entity_store_unavailable', reason: 'Provider binding persistence requires SQLite.' });
        const id = providerBindingMatch[1] ? decodeURIComponent(providerBindingMatch[1]) : undefined;
        const projectId = url.searchParams.get('projectId')?.trim();
        if (req.method === 'GET') {
          if (!projectId) return send(res, 400, { error: 'project_id_required', resource: 'provider-bindings' });
          const item = id ? stores.entityStore.getProjectProviderBinding(id, projectId) : undefined;
          if (id && !item) return send(res, 404, { error: 'provider_binding_not_found', id });
          return send(res, 200, (item ?? stores.entityStore.listProjectProviderBindings(projectId)) as any);
        }
        if (!['POST', 'PATCH'].includes(req.method ?? '')) return send(res, 405, { error: 'method_not_allowed' });
        const input = await body(req);
        const scope = String(input.projectId ?? projectId ?? '').trim();
        if (!scope) return send(res, 400, { error: 'project_id_required', resource: 'provider-binding' });
        if (!stores.entityStore.getProject(scope) && scope === String(fixture.project.id)) ensureFixtureProject(stores.entityStore, fixture, projectWorkspaceRoot(scope));
        if (!stores.entityStore.getProject(scope)) return send(res, 404, { error: 'project_not_found', projectId: scope });
        const requestedRole = String(input.role ?? 'primary') as ProjectProviderBinding['role'];
        const requestedPriority = Number(input.priority ?? 0);
        const existing = id
          ? stores.entityStore.getProjectProviderBinding(id, scope)
          : stores.entityStore.listProjectProviderBindings(scope).find((item) => item.role === requestedRole && item.priority === requestedPriority);
        if (id && !existing) return send(res, 404, { error: 'provider_binding_not_found', id });
        const connectionId = String(input.connectionId ?? existing?.connectionId ?? '').trim();
        if (!connectionId || !stores.entityStore.getProviderConnection(connectionId)) return send(res, 422, { error: 'provider_connection_required', connectionId });
        const now = new Date().toISOString();
        const item: ProjectProviderBinding = {
          id: String(existing?.id ?? input.id ?? `binding-${randomUUID()}`) as any,
          projectId: scope as any,
          connectionId: connectionId as any,
          model: String(input.model ?? existing?.model ?? '').trim(),
          role: String(input.role ?? existing?.role ?? requestedRole) as ProjectProviderBinding['role'],
          priority: Number(input.priority ?? existing?.priority ?? requestedPriority),
          enabled: input.enabled === undefined ? existing?.enabled !== false : Boolean(input.enabled),
          fallbackPolicy: String(input.fallbackPolicy ?? existing?.fallbackPolicy ?? 'never') as ProjectProviderBinding['fallbackPolicy'],
          revision: Number(input.revision ?? (existing ? existing.revision + 1 : 1)),
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        };
        if (!item.model) return send(res, 400, { error: 'provider_binding_model_required' });
        if (!['primary', 'fallback'].includes(item.role) || !['never', 'on_retryable_failure'].includes(item.fallbackPolicy) || !Number.isInteger(item.priority) || item.priority < 0) return send(res, 400, { error: 'invalid_provider_binding_policy' });
        if (existing && existing.connectionId === item.connectionId && existing.model === item.model && existing.role === item.role && existing.priority === item.priority && existing.enabled === item.enabled && existing.fallbackPolicy === item.fallbackPolicy) {
          return send(res, 200, { ...existing, idempotent: true } as any);
        }
        const slotConflict = stores.entityStore.listProjectProviderBindings(scope).find((candidate) => String(candidate.id) !== String(item.id) && candidate.role === item.role && candidate.priority === item.priority);
        if (slotConflict) return send(res, 409, { error: 'provider_binding_slot_conflict', projectId: scope, role: item.role, priority: item.priority, existingId: slotConflict.id });
        stores.entityStore.saveProjectProviderBinding(item);
        return send(res, existing ? 200 : 201, { ...item, ...(existing ? { replaced: true } : {}) } as any);
      } finally { stores.close?.(); }
    }

    const sessionRunMatch = url.pathname.match(/^\/api\/persistence\/sessions\/([^/]+)\/run$/);
    if (req.method === 'POST' && sessionRunMatch) {
      const sessionId = decodeURIComponent(sessionRunMatch[1]);
      const input = await body(req);
      const projectId = typeof input.projectId === 'string' ? input.projectId.trim() : '';
      const content = typeof input.content === 'string' ? input.content.trim() : '';
      const provider = input.provider === undefined ? 'fixture' : String(input.provider);
      if (!projectId) return send(res, 400, { error: 'project_id_required', resource: 'session_run', sessionId });
      if (!content) return send(res, 400, { error: 'session_message_required', sessionId });
      if (!['fixture', 'bound'].includes(provider)) return send(res, 422, { error: 'session_provider_not_supported', message: '会话目前支持本地 Fixture 或当前项目绑定的 Provider。', provider, sessionId });
      const stores = await defaultProductBuilderContinuityStores(dataDir);
      try {
        if (!stores.entityStore) return send(res, 503, { error: 'sqlite_entity_store_unavailable', reason: 'Session run requires SQLite.' });
        const session = stores.entityStore.getSession(sessionId, projectId);
        if (!session) return send(res, 404, { error: 'session_not_found', id: sessionId, projectId });
        if (session.status !== 'active') return send(res, 409, { error: 'session_archived', sessionId, projectId, message: '已归档会话不能继续运行。' });
        await reconcileSessionRuns(stores.entityStore, session);
        const messageId = typeof input.messageId === 'string' && input.messageId.trim() ? input.messageId.trim() : `session-message-${randomUUID()}`;
        const existingMessages = stores.entityStore.listSessionMessages(sessionId, projectId);
        const existing = existingMessages.find((item) => String(item.id) === messageId);
        if (existing?.runId) {
          const existingRun = await runtimeStore.getRun(existing.runId);
          if (!existingRun) return send(res, 409, { error: 'session_message_run_missing', messageId, runId: existing.runId });
          return send(res, 200, { idempotent: true, session, run: existingRun, userMessage: existing, messages: existingMessages });
        }
        if (existing) return send(res, 409, { error: 'session_message_in_progress', messageId });
        const sessionBot = stores.entityStore.getBotProfile(String(session.botId), projectId);
        if (!sessionBot) return send(res, 409, { error: 'session_bot_not_found', botId: session.botId, projectId });
        if (!sessionBot.enabled) return send(res, 409, { error: 'bot_disabled', botId: session.botId, projectId, message: '当前 Bot 已停用，不能继续运行会话。' });
        let bound: ReturnType<typeof resolveProviderBinding> | undefined;
        if (provider === 'bound') {
          try {
            bound = resolveProviderBinding({
              projectId: projectId as ProjectId,
              bindings: stores.entityStore.listProjectProviderBindings(projectId),
              connections: stores.entityStore.listProviderConnections(),
              allowFallback: true,
              allowUnverifiedSecretRef: true,
            });
          } catch (error) {
            if (error instanceof ProviderResolverError) return send(res, 409, { error: error.code, message: error.message, projectId, sessionId });
            throw error;
          }
          if (bound.connection.provider === 'deepseek') return send(res, 422, { error: 'session_provider_not_supported', message: 'DeepSeek 当前是 Product Builder 专用草稿通道，暂不作为通用会话模型。', provider: 'deepseek', sessionId, projectId });
          if (bound.connection.provider === 'codex' && sessionBot.toolPolicy.permissionTier !== 'read_only') {
            return send(res, 409, { error: 'session_codex_requires_read_only', message: '当前会话的 Codex 入口暂只开放只读 Bot，避免把会话输入直接升级为写入权限。', sessionId, projectId, botId: session.botId });
          }
        }
        const sequence = existingMessages.reduce((max, item) => Math.max(max, item.sequence), 0) + 1;
        const userMessage: SessionMessage = {
          id: messageId as any,
          sessionId: sessionId as any,
          sequence,
          role: 'user',
          content,
          createdAt: new Date().toISOString(),
        };
        stores.entityStore.appendSessionMessage(userMessage);
        const sessionSkillIds = sessionBot?.skillIds.map(String) ?? [];
        const sessionActiveSkillIds = sessionSkillIds.filter((id) => stores.entityStore?.getSkill(id)?.enabled === true);
        const sessionDisabledSkillIds = sessionSkillIds.filter((id) => !sessionActiveSkillIds.includes(id));
        const runtimeScope = { projectId: projectId as ProjectId, botId: session.botId as BotId, sessionId: session.id as any, sessionMessageId: messageId, ...(sessionActiveSkillIds.length ? { skillIds: sessionActiveSkillIds } : {}), ...(sessionDisabledSkillIds.length ? { disabledSkillIds: sessionDisabledSkillIds } : {}) };
        const result = provider === 'bound' && bound?.connection.provider === 'codex'
          ? await executeCodexRun(
            content,
            { idea: content, sessionId, botId: String(session.botId) },
            {
              model: bound.binding.model,
              cwd: projectWorkspaceRoot(projectId),
              constraints: ['只读分析当前项目。不得写入文件、安装依赖、发送消息、读取凭据或访问项目外路径。'],
            },
            runtimeScope,
          )
          : await executeFixtureToolLoop(
            content,
            { idea: content, path: typeof input.path === 'string' ? input.path : 'fixtures/demo-project.json' },
            ['normal', 'failure', 'approval'].includes(String(input.scenario)) ? String(input.scenario) as any : 'normal',
            runtimeScope,
          );
        const providerEvents = 'providerEvents' in result ? result.providerEvents : undefined;
        const providerIdentity = 'provider' in result ? result.provider : undefined;
        const resultStatus = 'status' in result ? result.status : result.run.status;
        const resultEvents = 'events' in result ? result.events : await runtimeStore.listEvents(result.run.id);
        const resultArtifact = 'artifact' in result ? result.artifact : undefined;
        const resultApproval = 'approval' in result ? result.approval : undefined;
        const resultError = 'error' in result ? result.error : result.run.error;
        const messages = stores.entityStore.reconcileSessionRun({ sessionId, projectId, messageId, runId: String(result.run.id), assistantContent: sessionRunAssistantContent(result.run, providerEvents), ...(providerIdentity ? { provider: providerIdentity } : {}) });
        const assistantMessage = messages.find((item) => String(item.id) === `${messageId}:assistant`)!;
        return send(res, resultStatus === 'succeeded' ? 200 : resultStatus === 'waiting_user' ? 202 : 422, {
          idempotent: false,
          session,
          run: result.run,
          userMessage: { ...userMessage, runId: result.run.id },
          assistantMessage,
          messages,
          events: resultEvents,
          ...(providerIdentity ? { provider: providerIdentity, isMock: providerIdentity.isMock } : {}),
          artifact: resultArtifact ?? null,
          approval: resultApproval ?? null,
          error: resultError ?? null,
        });
      } finally {
        stores.close?.();
      }
    }

    const sessionMessagesMatch = url.pathname.match(/^\/api\/persistence\/sessions\/([^/]+)\/messages$/);
    if (sessionMessagesMatch) {
      const stores = await defaultProductBuilderContinuityStores(dataDir);
      try {
        if (!stores.entityStore) return send(res, 503, { error: 'sqlite_entity_store_unavailable', reason: 'Session persistence requires SQLite.' });
        const sessionId = decodeURIComponent(sessionMessagesMatch[1]);
      const projectId = url.searchParams.get('projectId')?.trim();
      if (!projectId) return send(res, 400, { error: 'project_id_required', resource: 'session-messages' });
        const session = stores.entityStore.getSession(sessionId, projectId);
        if (!session) return send(res, 404, { error: 'session_not_found', id: sessionId });
        await reconcileSessionRuns(stores.entityStore, session);
        if (req.method === 'GET') return send(res, 200, stores.entityStore.listSessionMessages(sessionId, projectId) as any);
        if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
        const input = await body(req);
        const message: SessionMessage = {
          id: String(input.id ?? `message-${randomUUID()}`) as any,
          sessionId: sessionId as any,
          sequence: Number(input.sequence),
          role: String(input.role ?? 'user') as SessionMessage['role'],
          content: String(input.content ?? ''),
          ...(input.runId ? { runId: String(input.runId) as any } : {}),
          ...(input.provider ? { provider: input.provider as any } : {}),
          createdAt: new Date().toISOString(),
        };
        if (!Number.isInteger(message.sequence) || message.sequence < 1 || !['user', 'assistant', 'system', 'tool'].includes(message.role) || !message.content) return send(res, 400, { error: 'invalid_session_message' });
        stores.entityStore.appendSessionMessage(message);
        return send(res, 201, message as any);
      } finally { stores.close?.(); }
    }

    const sessionsMatch = url.pathname.match(/^\/api\/persistence\/sessions(?:\/([^/]+))?$/);
    if (sessionsMatch) {
      const stores = await defaultProductBuilderContinuityStores(dataDir);
      try {
        if (!stores.entityStore) return send(res, 503, { error: 'sqlite_entity_store_unavailable', reason: 'Session persistence requires SQLite.' });
        const id = sessionsMatch[1] ? decodeURIComponent(sessionsMatch[1]) : undefined;
        const projectId = url.searchParams.get('projectId')?.trim();
        if (req.method === 'GET') {
          if (!projectId) return send(res, 400, { error: 'project_id_required', resource: 'sessions' });
          const item = id ? stores.entityStore.getSession(id, projectId) : undefined;
          if (id && !item) return send(res, 404, { error: 'session_not_found', id });
          return send(res, 200, (item ?? stores.entityStore.listSessions(projectId)) as any);
        }
        if (!['POST', 'PATCH'].includes(req.method ?? '')) return send(res, 405, { error: 'method_not_allowed' });
        const input = await body(req);
        const scope = String(input.projectId ?? projectId ?? '').trim();
        if (!scope) return send(res, 400, { error: 'project_id_required', resource: 'session' });
        if (!stores.entityStore.getProject(scope) && scope === String(fixture.project.id)) ensureFixtureProject(stores.entityStore, fixture, projectWorkspaceRoot(scope));
        if (!stores.entityStore.getProject(scope)) return send(res, 404, { error: 'project_not_found', projectId: scope });
        const existing = id ? stores.entityStore.getSession(id, scope) : undefined;
        if (id && !existing) return send(res, 404, { error: 'session_not_found', id });
        const botId = String(input.botId ?? existing?.botId ?? '').trim();
        const sessionBot = botId ? stores.entityStore.getBotProfile(botId, scope) : undefined;
        if (!sessionBot) return send(res, 422, { error: 'bot_required_for_session', botId });
        if (!sessionBot.enabled) return send(res, 409, { error: 'bot_disabled', botId, projectId: scope, message: '停用的 Bot 不能创建或更新会话。' });
        const now = new Date().toISOString();
        const session: Session = {
          id: String(existing?.id ?? input.id ?? `session-${randomUUID()}`) as any,
          projectId: scope as any,
          botId: botId as any,
          title: String(input.title ?? existing?.title ?? '新会话').trim(),
          status: String(input.status ?? existing?.status ?? 'active') as Session['status'],
          ...(input.contextSnapshotId ?? existing?.contextSnapshotId ? { contextSnapshotId: String(input.contextSnapshotId ?? existing?.contextSnapshotId) as any } : {}),
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        };
        if (!session.title || !['active', 'archived'].includes(session.status)) return send(res, 400, { error: 'invalid_session' });
        stores.entityStore.saveSession(session);
        return send(res, existing ? 200 : 201, session as any);
      } finally { stores.close?.(); }
    }

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
            const projectId = url.searchParams.get('projectId')?.trim();
            if (!projectId) return send(res, 400, { error: 'project_id_required', resource: 'bots' });
            if (projectId === String(fixture.project.id) && !stores.entityStore.getProject(projectId)) ensureFixtureProject(stores.entityStore, fixture, projectWorkspaceRoot(projectId));
            const bot = entityId ? stores.entityStore.getBotProfile(entityId, projectId) : undefined;
            if (entityId && !bot) return send(res, 404, { error: 'bot_not_found', id: entityId });
            return send(res, 200, (bot ?? stores.entityStore.listBotProfiles(projectId)) as any);
          }
          if (req.method === 'POST') {
            const required = ['projectId', 'name', 'description', 'responsibility', 'inputSchema', 'outputSchema', 'skillIds', 'toolPolicy', 'providerPolicy', 'memoryPolicy', 'approvalPolicy'];
            if (required.some((key) => input[key] === undefined)) return send(res, 400, { error: 'bot_profile_fields_required', fields: required });
            if (hasUnsafeInitialBotPolicy(input)) return send(res, 409, { error: 'bot_policy_approval_required', reason: '新建 Bot 的非只读权限必须先经过逐次审批。' });
            const projectId = String(input.projectId).trim();
            if (!stores.entityStore.getProject(projectId)) return send(res, 404, { error: 'project_not_found', projectId });
            const parsedSkillIds = parseSkillIds(input.skillIds);
            if (parsedSkillIds.error) return send(res, 400, { error: parsedSkillIds.error });
            const skillError = validateSkillIds(stores.entityStore, parsedSkillIds.ids ?? []);
            if (skillError) return send(res, 422, { error: 'skill_not_found', detail: skillError });
            const bot = { id: String(input.id ?? `bot-${randomUUID()}`), projectId, name: String(input.name), description: String(input.description), responsibility: String(input.responsibility), inputSchema: input.inputSchema, outputSchema: input.outputSchema, skillIds: parsedSkillIds.ids, toolPolicy: input.toolPolicy, providerPolicy: input.providerPolicy, memoryPolicy: input.memoryPolicy, approvalPolicy: input.approvalPolicy, enabled: input.enabled !== false, createdAt: now, updatedAt: now } as any;
            stores.entityStore.saveBotProfile(bot);
            return send(res, 201, bot);
          }
          if (req.method === 'PATCH' && entityId) {
            const projectId = url.searchParams.get('projectId')?.trim();
            if (!projectId) return send(res, 400, { error: 'project_id_required', resource: 'bot', id: entityId });
            let existing = stores.entityStore.getBotProfile(entityId, projectId);
            if (!existing && projectId === String(fixture.project.id)) {
              ensureFixtureProject(stores.entityStore, fixture, projectWorkspaceRoot(projectId));
              existing = stores.entityStore.getBotProfile(entityId, projectId);
            }
            if (!existing) return send(res, 404, { error: 'bot_not_found', id: entityId });
            if (input.skillIds !== undefined) {
              const parsedSkillIds = parseSkillIds(input.skillIds);
              if (parsedSkillIds.error) return send(res, 400, { error: parsedSkillIds.error });
              const skillError = validateSkillIds(stores.entityStore, parsedSkillIds.ids ?? []);
              if (skillError) return send(res, 422, { error: 'skill_not_found', detail: skillError });
              input.skillIds = parsedSkillIds.ids;
            }
            if (hasBotPolicyChange(existing, input)) {
              const policyPatch = botPolicyPatch(input);
              const created = await createRuntimeRun(`审批 Bot 策略变更：${existing.name}`, { projectId: projectId as ProjectId, botId: existing.id as BotId });
              const waiting = await runtimeStore.transition(created.run.id, 'wait_user', { reason: 'Bot 权限或执行策略变更需要逐次审批' });
              const approval: ApprovalRequest = {
                id: createApprovalRequestId(),
                projectId: projectId as ProjectId,
                runId: waiting.run.id,
                action: 'bot.policy.update',
                description: `修改 Bot「${existing.name}」的执行策略。批准后才会写入配置。`,
                permissionTier: 'read_only',
                status: 'pending',
                requestedAt: now,
                metadata: { kind: 'bot_policy', botId: existing.id, patch: policyPatch, previousPolicy: Object.fromEntries(BOT_POLICY_FIELDS.map((field) => [field, existing[field]])) } as any,
              };
              stores.entityStore.saveApprovalRequest(approval);
              const approvalEvent = createRunEvent(waiting.run.id, 'approval.requested', { approvalId: approval.id, action: approval.action, botId: existing.id, projectId, idempotencyKey: `approval:${approval.id}` }, (await runtimeStore.listEvents(waiting.run.id)).length + 1, { type: 'system' });
              await runtimeStore.appendEvent(approvalEvent);
              return send(res, 202, { error: 'bot_policy_approval_required', approvalRequired: true, approval, run: await runtimeStore.getRun(waiting.run.id), events: await runtimeStore.listEvents(waiting.run.id) });
            }
            const enabled = input.enabled === undefined ? existing.enabled : Boolean(input.enabled);
            const bot = { ...existing, ...input, id: existing.id, projectId: existing.projectId, createdAt: existing.createdAt, updatedAt: now, enabled, ...(enabled ? { disabledAt: undefined } : { disabledAt: existing.disabledAt ?? now }) } as any;
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
        const projectId = url.searchParams.get('projectId')?.trim();
        if (!projectId) return send(res, 400, { error: 'project_id_required', resource: 'entities' });
        const continuityEvents = await stores.eventLog.readAll();
        const productBuilderStates = continuityEvents
          .filter((item) => item.type === 'product_builder.state_checkpoint' || Boolean((item.data as any)?.productBuilderState))
          .map((item) => String(item.runId))
          .filter((runId, index, all) => all.indexOf(runId) === index)
          .map((runId) => readLatestProductBuilderState(continuityEvents.filter((item) => String(item.runId) === runId) as any, runId))
          .filter((state) => state && (!projectId || state.projectId === projectId));
        return send(res, 200, {
          projects: stores.entityStore?.listProjects() ?? [],
          bots: stores.entityStore?.listBotProfiles(projectId) ?? [],
          skills: stores.entityStore?.listSkills() ?? [],
          providerConnections: stores.entityStore?.listProviderConnections() ?? [],
          providerBindings: stores.entityStore?.listProjectProviderBindings(projectId) ?? [],
          sessions: stores.entityStore?.listSessions(projectId) ?? [],
          policyAudit: stores.entityStore?.listPolicyAudit(projectId) ?? [],
          handoffs: stores.entityStore?.listHandoffs(projectId) ?? [],
          approvals: stores.entityStore?.listApprovals(projectId) ?? [],
          sources: stores.entityStore?.listSources(projectId) ?? [],
          artifacts: stores.entityStore?.listArtifacts(projectId) ?? [],
          memories: stores.entityStore?.listMemories(projectId) ?? [],
          receipts: projectId && stores.entityStore ? stores.entityStore.listReceiptsByProject(projectId) : stores.entityStore?.listReceipts() ?? [],
          modelReceipts: (stores.entityStore ? stores.entityStore.listReceiptsByProject(projectId) : []).map((item) => providerModelReceiptView(item, projectId)).filter((item): item is Record<string, unknown> => Boolean(item)),
          productBuilderStates,
        });
      } finally {
        stores.close?.();
      }
    }
    const artifactDetailMatch = url.pathname.match(/^\/api\/persistence\/(artifacts|sources)\/([^/]+)$/);
    if (req.method === 'GET' && artifactDetailMatch) {
      const stores = await defaultProductBuilderContinuityStores(dataDir);
      try {
        if (!stores.entityStore) return send(res, 503, { error: 'sqlite_entity_store_unavailable', reason: 'Artifact/source preview requires the SQLite operational backend.' });
        const entity = artifactDetailMatch[1];
        const id = decodeURIComponent(artifactDetailMatch[2]);
        const projectId = url.searchParams.get('projectId')?.trim();
        if (!projectId) return send(res, 400, { error: 'project_id_required', entity, id });
        if (entity === 'artifacts') {
          const artifact = stores.entityStore.getArtifact(id, projectId);
          if (!artifact) return send(res, 404, { error: 'artifact_not_found', id });
          const events = await stores.eventLog.readAll();
          const state = readLatestProductBuilderState(events.filter((item) => String(item.runId) === String(artifact.runId)) as any, String(artifact.runId));
          return send(res, 200, {
            ...artifact,
            releaseStatus: state ? (state.finalArtifactIds.includes(String(artifact.id)) ? 'final' : 'draft') : 'unknown',
            releaseState: state ?? null,
          });
        }
        const source = stores.entityStore.getSource(id, projectId);
        if (!source) return send(res, 404, { error: 'source_not_found', id });
        return send(res, 200, source as any);
      } finally {
        stores.close?.();
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/product-builder/preview') {
      const input = await body(req);
      const idea = String(input.idea ?? fixture.run.goal);
      if (!idea.trim()) return send(res, 422, { error: 'idea_required' });
      const projectScope = typeof input.projectId === 'string' && input.projectId.trim() ? input.projectId.trim() : String(fixture.project.id);
      if (!(await projectScopeExists(projectScope, String(fixture.project.id)))) return send(res, 404, { error: 'project_not_found', projectId: projectScope });
      const requestedRunId = typeof input.runId === 'string' ? input.runId.trim() : '';
      const runId = /^[A-Za-z0-9._:-]{1,128}$/.test(requestedRunId) ? requestedRunId : projectScope === String(fixture.project.id) ? fixture.run.id : `run-product-builder-${randomUUID()}`;
      const builderResult = runProductBuilder({ projectId: projectScope as any, runId, idea, user: input.user ? String(input.user) : undefined });
      const stores = await defaultProductBuilderContinuityStores(dataDir);
      let continuity;
      try {
        if (stores.entityStore && projectScope === String(fixture.project.id)) ensureFixtureBotProfiles(stores.entityStore, fixture, projectScope);
        continuity = await checkpointProductBuilderResult(
          { projectId: projectScope as any, runId: runId as any, idea: String(input.idea ?? fixture.run.goal) },
          builderResult,
          stores,
        );
        const persistedArtifacts = stores.entityStore?.listArtifactsByRun(runId) ?? [];
        const persistedState = continuity.persistedState;
        const responseBuilderResult = {
          ...builderResult,
          ...(persistedArtifacts.length > 0 ? { artifacts: persistedArtifacts } : {}),
          ...(persistedState ? {
            artifactRelease: persistedState.artifactRelease,
            finalArtifactIds: persistedState.finalArtifactIds,
            conflicts: persistedState.conflicts,
            handoffValidation: persistedState.handoffValidation,
            releaseBlockers: persistedState.releaseBlockers,
          } : {}),
        };
        return send(res, 200, {
          runId,
          ...responseBuilderResult,
          continuity: {
            createdCheckpoints: continuity.createdCheckpoints,
            skippedCheckpoints: continuity.skippedCheckpoints,
            createdSnapshots: continuity.createdSnapshots,
            latestSnapshotId: continuity.latestSnapshot?.id ?? null,
            persistedState: persistedState ?? null,
            persistence: stores.persistence ?? null,
          },
        });
      } finally {
        stores.close?.();
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/product-builder/provider-draft') {
      const input = await body(req);
      const idea = typeof input.idea === 'string' ? input.idea.trim() : '';
      if (!idea) return send(res, 422, { error: 'idea_required' });
      const projectScope = typeof input.projectId === 'string' && input.projectId.trim() ? input.projectId.trim() : String(fixture.project.id);
      if (!(await projectScopeExists(projectScope, String(fixture.project.id)))) return send(res, 404, { error: 'project_not_found', projectId: projectScope });
      const result = await executeDeepSeekProductBuilderDraft({
        idea,
        projectId: projectScope as ProjectId,
        ...(typeof input.botId === 'string' && input.botId.trim() ? { botId: input.botId.trim() as BotId } : {}),
        ...(typeof input.user === 'string' && input.user.trim() ? { user: input.user.trim() } : {}),
        ...(Array.isArray(input.constraints) ? { constraints: input.constraints.filter((item): item is string => typeof item === 'string').slice(0, 20) } : {}),
      });
      const statusCode = result.error?.code === 'deepseek_api_key_missing' ? 503 : result.status === 'succeeded' ? 200 : 422;
      return send(res, statusCode, {
        runId: result.run.id,
        status: result.status,
        run: result.run,
        provider: result.provider,
        draft: result.draft ?? null,
        artifact: result.artifact ?? null,
        providerReceipt: result.providerReceipt ?? null,
        outputReceipt: result.outputReceipt ?? null,
        events: result.events,
        error: typeof result.error?.code === 'string' ? result.error.code : result.error ?? null,
        errorDetail: result.error ?? null,
        promotion: { status: 'pending_user_approval', message: '这是可审阅草稿，尚未替换正式 Product Builder Artifact。' },
      });
    }
    const clarificationResolveMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/clarifications\/resolve$/);
    if (req.method === 'POST' && clarificationResolveMatch) {
      const runId = decodeURIComponent(clarificationResolveMatch[1]);
      const input = await body(req);
      const clarificationId = typeof input.clarificationId === 'string' ? input.clarificationId : '';
      const value = typeof input.value === 'string' ? input.value : '';
      if (!clarificationId) return send(res, 400, { error: 'clarification_id_required', runId });
      const stores = await defaultProductBuilderContinuityStores(dataDir);
      try {
        const result = await resolveProductBuilderClarification({
          projectId: String(input.projectId ?? fixture.project.id) as any,
          runId: runId as any,
          clarificationId,
          value,
          idempotencyKey: typeof input.idempotencyKey === 'string' ? input.idempotencyKey : undefined,
        }, stores);
        if (!result.ok) return send(res, result.error === 'clarification_state_not_found' ? 404 : 400, { error: result.error, runId, clarificationId });
        return send(res, 200, { ...result, runId, clarificationId });
      } finally {
        stores.close?.();
      }
    }
    if (req.method === 'GET' && url.pathname === '/api/provider/codex-probe') return send(res, 200, await codexProbe());
    if (req.method === 'GET' && url.pathname === '/api/provider/codex-diagnostics') return send(res, 200, await codexEnvironmentDiagnostics());
    if (req.method === 'GET' && url.pathname === '/api/provider/resolve') {
      const projectId = url.searchParams.get('projectId')?.trim();
      if (!projectId) return send(res, 400, { error: 'project_id_required', resource: 'provider_resolve' });
      const stores = await defaultProductBuilderContinuityStores(dataDir);
      try {
        if (!stores.entityStore) return send(res, 503, { error: 'sqlite_entity_store_unavailable', reason: 'Provider resolution requires SQLite.' });
        if (!stores.entityStore.getProject(projectId)) return send(res, 404, { error: 'project_not_found', projectId });
        try {
          const resolved = resolveProviderBinding({
            projectId: projectId as ProjectId,
            bindings: stores.entityStore.listProjectProviderBindings(projectId),
            connections: stores.entityStore.listProviderConnections(),
            ...(url.searchParams.get('connectionId') ? { requestedConnectionId: url.searchParams.get('connectionId') as any } : {}),
            allowFallback: url.searchParams.get('allowFallback') === 'true',
            ...(url.searchParams.get('failureClass') ? { failureClass: url.searchParams.get('failureClass') as any } : {}),
          });
          return send(res, 200, { projectId, selection: resolved.selection, binding: resolved.binding as any, connection: resolved.connection as any });
        } catch (error) {
          if (error instanceof ProviderResolverError) return send(res, 409, { error: error.code, message: error.message, projectId });
          throw error;
        }
      } finally { stores.close?.(); }
    }
    if (req.method === 'POST' && url.pathname === '/api/provider/codex-run') {
      const input = await body(req);
      const projectScope = typeof input.projectId === 'string' && input.projectId.trim() ? input.projectId.trim() : String(fixture.project.id);
      if (!(await projectScopeExists(projectScope, String(fixture.project.id)))) return send(res, 404, { error: 'project_not_found', projectId: projectScope });
      const result = await executeCodexRun(
        String(input.objective ?? input.goal ?? '用 Codex 评估一个产品想法'),
        (input.input ?? { idea: input.idea ?? input.goal ?? '' }) as any,
        {},
        {
          projectId: projectScope as ProjectId,
          ...(typeof input.botId === 'string' && input.botId.trim() ? { botId: input.botId.trim() as BotId } : {}),
        },
      );
      return send(res, result.run.status === 'succeeded' ? 200 : 502, result as any);
    }
    if (req.method === 'POST' && url.pathname === '/api/improvements/run') {
      const input = await body(req);
      const projectId = typeof input.projectId === 'string' ? input.projectId.trim() : '';
      if (!projectId) return send(res, 400, { error: 'project_id_required', resource: 'improvement_run' });
      const requestedTarget = typeof input.target === 'string' && input.target.trim() ? input.target.trim() : 'prompt';
      if (!(IMPROVEMENT_TARGETS as readonly string[]).includes(requestedTarget)) {
        return send(res, 400, { error: 'invalid_improvement_target', target: requestedTarget, allowedTargets: IMPROVEMENT_TARGETS });
      }
      const requestedMemoryStrategy = input.memoryStrategy === undefined ? 'lexical' : String(input.memoryStrategy).trim();
      if (requestedMemoryStrategy !== 'lexical' && requestedMemoryStrategy !== 'hybrid') {
        return send(res, 400, { error: 'invalid_memory_strategy', memoryStrategy: requestedMemoryStrategy, allowedStrategies: ['lexical', 'hybrid'] });
      }
      const stores = await defaultProductBuilderContinuityStores(dataDir);
      try {
        if (!stores.entityStore) return send(res, 503, { error: 'sqlite_entity_store_unavailable', reason: 'RSI proposal persistence requires the SQLite operational backend.' });
        const result = await startImprovementRun({
          projectId: projectId as ProjectId,
          ...(typeof input.botId === 'string' && input.botId.trim() ? { botId: input.botId.trim() as BotId } : {}),
          target: requestedTarget as ImprovementTarget,
          memoryStrategy: requestedMemoryStrategy as 'lexical' | 'hybrid',
          ...(typeof input.reason === 'string' ? { reason: input.reason } : {}),
          ...(typeof input.idempotencyKey === 'string' && input.idempotencyKey.trim() ? { idempotencyKey: input.idempotencyKey.trim() } : {}),
        }, { runStore: runtimeStore, stores, memoryAdapter: new SqliteMemoryAdapter(stores.entityStore) });
        return send(res, result.idempotent ? 200 : result.run.status === 'waiting_user' ? 202 : 201, {
          runId: result.run.id,
          run: result.run,
          projection: result.projection,
          evaluationBundle: improvementEvaluationBundle(await runtimeStore.listEvents(result.run.id)),
          artifacts: improvementArtifacts(stores, result.run.id, projectId as ProjectId),
          approvals: improvementApprovals(stores, result.run.id, projectId as ProjectId),
          idempotent: result.idempotent,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message === 'sqlite_entity_store_unavailable') return send(res, 503, { error: message });
        if (message.startsWith('unsupported_improvement_target:')) return send(res, 400, { error: 'invalid_improvement_target', target: requestedTarget });
        if (message.startsWith('unsupported_improvement_memory_strategy:')) return send(res, 400, { error: 'invalid_memory_strategy', memoryStrategy: requestedMemoryStrategy });
        throw error;
      } finally {
        stores.close?.();
      }
    }
    const improvementMatch = url.pathname.match(/^\/api\/improvements\/([^/]+)$/);
    if (req.method === 'GET' && improvementMatch) {
      const runId = decodeURIComponent(improvementMatch[1]);
      const projectId = url.searchParams.get('projectId')?.trim();
      if (!projectId) return send(res, 400, { error: 'project_id_required', resource: 'improvement', runId });
      const run = await runtimeStore.getRun(runId as any);
      if (!run || String(run.projectId) !== projectId) return send(res, 404, { error: 'improvement_run_not_found', runId });
      const stores = await defaultProductBuilderContinuityStores(dataDir);
      try {
        if (!stores.entityStore) return send(res, 503, { error: 'sqlite_entity_store_unavailable', reason: 'RSI projection requires the SQLite operational backend.' });
        const events = await runtimeStore.listEvents(run.id);
        return send(res, 200, {
          runId,
          run,
          projection: await readImprovementProjection(run.id, { runStore: runtimeStore, stores }),
          events,
          evaluationBundle: improvementEvaluationBundle(events),
          artifacts: improvementArtifacts(stores, run.id, projectId as ProjectId),
          approvals: improvementApprovals(stores, run.id, projectId as ProjectId),
        });
      } finally {
        stores.close?.();
      }
    }
    const improvementRollbackMatch = url.pathname.match(/^\/api\/improvements\/([^/]+)\/rollback$/);
    if (req.method === 'POST' && improvementRollbackMatch) {
      const runId = decodeURIComponent(improvementRollbackMatch[1]);
      const input = await body(req);
      const projectId = typeof input.projectId === 'string' ? input.projectId.trim() : '';
      if (!projectId) return send(res, 400, { error: 'project_id_required', resource: 'improvement_rollback', runId });
      const stores = await defaultProductBuilderContinuityStores(dataDir);
      try {
        if (!stores.entityStore) return send(res, 503, { error: 'sqlite_entity_store_unavailable', reason: 'RSI rollback requires the SQLite operational backend.' });
        const result = await rollbackImprovement(runId as any, projectId as ProjectId, typeof input.reason === 'string' ? input.reason : '', { runStore: runtimeStore, stores });
        const events = await runtimeStore.listEvents(result.run.id);
        return send(res, 200, {
          runId,
          run: result.run,
          projection: result.projection,
          events,
          evaluationBundle: improvementEvaluationBundle(events),
          artifacts: improvementArtifacts(stores, result.run.id, projectId as ProjectId),
          approvals: improvementApprovals(stores, result.run.id, projectId as ProjectId),
          idempotent: result.idempotent,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message === 'improvement_run_not_found') return send(res, 404, { error: message, runId });
        if (message === 'improvement_rollback_not_allowed') return send(res, 409, { error: message, runId });
        throw error;
      } finally {
        stores.close?.();
      }
    }
    const runEventsMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/events$/);
    if (req.method === 'GET' && runEventsMatch) {
      const runId = decodeURIComponent(runEventsMatch[1]);
      const projectId = url.searchParams.get('projectId')?.trim();
      if (!projectId) return send(res, 400, { error: 'project_id_required', resource: 'run_events', runId });
      const runtimeRun = await runtimeStore.getRun(runId as any);
      if (runtimeRun && String(runtimeRun.projectId) !== projectId) return send(res, 404, { error: 'run_events_not_found', runId });
      const stores = await defaultProductBuilderContinuityStores(dataDir);
      try {
        const continuityEvents = (await stores.eventLog.readAll()).filter((item) => String(item.runId) === runId);
        if (continuityEvents.length) {
          const state = readLatestProductBuilderState(continuityEvents as any, runId);
          if (state && String(state.projectId) !== projectId) return send(res, 404, { error: 'run_events_not_found', runId });
          if (!runtimeRun && !state && runId === String(fixture.run.id) && projectId !== String(fixture.project.id)) return send(res, 404, { error: 'run_events_not_found', runId });
          return send(res, 200, { runId, events: continuityEvents });
        }
      } finally {
        stores.close?.();
      }
      const events = await runtimeStore.listEvents(runId as any);
      if (events.length) return send(res, 200, { runId, events });
      if (runId === String(fixture.run.id) && projectId === String(fixture.project.id)) return send(res, 200, { runId, events: fixture.run.events });
      return send(res, 404, { error: 'run_events_not_found', runId });
    }
    if (req.method === 'POST' && url.pathname === '/api/runs') {
      const input = await body(req);
      const runtimeScope: import('./runtime.ts').RuntimeScope = {
        projectId: (typeof input.projectId === 'string' && input.projectId.trim() ? input.projectId.trim() : String(fixture.project.id)) as ProjectId,
        ...(typeof input.botId === 'string' && input.botId.trim() ? { botId: input.botId.trim() as BotId } : {}),
      };
      if (!(await projectScopeExists(String(runtimeScope.projectId), String(fixture.project.id)))) {
        return send(res, 404, { error: 'project_not_found', projectId: runtimeScope.projectId });
      }
      if (runtimeScope.botId) {
        const scopeStores = await defaultProductBuilderContinuityStores(dataDir);
        try {
          const ownedBot = scopeStores.entityStore?.getBotProfile(String(runtimeScope.botId), String(runtimeScope.projectId));
          if (!ownedBot) return send(res, 404, { error: 'bot_not_found', botId: runtimeScope.botId, projectId: runtimeScope.projectId });
          if (!ownedBot.enabled) return send(res, 409, { error: 'bot_disabled', botId: runtimeScope.botId, projectId: runtimeScope.projectId, message: '当前 Bot 已停用，不能启动运行。' });
          const configuredSkillIds = ownedBot.skillIds.map(String);
          const activeSkillIds = configuredSkillIds.filter((id) => scopeStores.entityStore?.getSkill(id)?.enabled === true);
          runtimeScope.skillIds = activeSkillIds;
          const disabledSkillIds = configuredSkillIds.filter((id) => !activeSkillIds.includes(id));
          if (disabledSkillIds.length) runtimeScope.disabledSkillIds = disabledSkillIds;
        } finally { scopeStores.close?.(); }
      }
      if (input.provider === 'bound') {
        let resolvedBinding: ReturnType<typeof resolveProviderBinding>;
        const bindingStores = await defaultProductBuilderContinuityStores(dataDir);
        try {
          if (!bindingStores.entityStore) return send(res, 503, { error: 'sqlite_entity_store_unavailable', reason: 'Bound provider execution requires SQLite.' });
          resolvedBinding = resolveProviderBinding({
            projectId: runtimeScope.projectId as ProjectId,
            bindings: bindingStores.entityStore.listProjectProviderBindings(String(runtimeScope.projectId)),
            connections: bindingStores.entityStore.listProviderConnections(),
            allowFallback: true,
            allowUnverifiedSecretRef: true,
            ...(typeof input.failureClass === 'string' ? { failureClass: input.failureClass as any } : {}),
          });
        } catch (error) {
          if (error instanceof ProviderResolverError) return send(res, 409, { error: error.code, message: error.message, projectId: runtimeScope.projectId });
          throw error;
        } finally { bindingStores.close?.(); }

        const { binding, connection, selection } = resolvedBinding;
        const boundMeta = { boundProvider: connection.provider, bindingId: binding.id, connectionId: connection.id, selection, model: binding.model };
        if (connection.provider === 'fixture') {
          const result = await executeFixtureToolLoop(String(input.goal ?? input.objective ?? '使用项目绑定完成一次本地诊断'), { idea: input.goal ?? input.objective ?? '', path: input.path ?? 'fixtures/demo-project.json' } as any, 'normal', runtimeScope);
          return send(res, result.run.status === 'succeeded' ? 200 : result.run.status === 'waiting_user' ? 202 : 422, {
            id: result.run.id, runId: result.run.id, run: result.run, status: result.status, provider: 'bound', isMock: true, ...boundMeta,
            events: result.events, artifact: result.artifact ?? null, approval: result.approval ?? null, error: result.error ?? null,
          });
        }
        if (connection.provider === 'deepseek') {
          const secretRef = connection.secretRef?.kind === 'env' ? connection.secretRef.name : undefined;
          const apiKey = secretRef ? process.env[secretRef] : undefined;
          if (!apiKey) return send(res, 503, { error: 'bound_deepseek_api_key_missing', message: `项目绑定引用的环境变量未配置：${secretRef ?? 'unknown'}`, projectId: runtimeScope.projectId, ...boundMeta });
          const result = await executeDeepSeekProductBuilderDraft({
            idea: String(input.goal ?? input.objective ?? '完成一次 Product Builder 草稿'),
            user: '项目绑定运行',
            constraints: ['使用当前项目 Provider 绑定', '只生成可审阅草稿，不自动发布'],
            projectId: runtimeScope.projectId,
            ...(runtimeScope.botId ? { botId: runtimeScope.botId } : {}),
            apiKey,
            model: binding.model,
          });
          return send(res, result.run.status === 'succeeded' ? 200 : 422, {
            id: result.run.id, runId: result.run.id, run: result.run, status: result.status, provider: 'bound', isMock: false, ...boundMeta,
            events: result.events, artifact: result.artifact ?? null, draft: result.draft ?? null, providerReceipt: result.providerReceipt ?? null, error: result.error ?? null,
          });
        }
        if (connection.provider === 'codex') {
          const structuredOutput = input.outputMode === 'structured';
          const outputSchema = input.outputSchema && typeof input.outputSchema === 'object' && !Array.isArray(input.outputSchema)
            ? input.outputSchema as JsonObject
            : undefined;
          const result = await executeCodexRun(
            String(input.goal ?? input.objective ?? '用项目绑定的 Codex 执行一次只读任务'),
            (input.input ?? { idea: input.goal ?? input.objective ?? '' }) as any,
            {
              model: binding.model,
              cwd: projectWorkspaceRoot(runtimeScope.projectId),
              ...(structuredOutput ? { outputMode: 'structured' as const, ...(outputSchema ? { outputSchema } : {}) } : {}),
            },
            runtimeScope,
          );
          return send(res, result.run.status === 'succeeded' ? 200 : 502, { ...result, provider: 'bound', isMock: false, ...boundMeta });
        }
        return send(res, 409, { error: 'bound_provider_unsupported', message: `当前绑定 Provider 暂不支持运行：${connection.provider}`, projectId: runtimeScope.projectId, ...boundMeta });
      }
      if (input.provider === 'tool-loop-fixture') {
        const scenario = ['normal', 'approval', 'schema-error', 'failure', 'duplicate', 'max-loop'].includes(String(input.scenario)) ? String(input.scenario) as any : 'normal';
        const result = await executeFixtureToolLoop(String(input.goal ?? '验证模型到工具再回传的完整循环'), { idea: input.goal ?? '', path: input.path ?? 'fixtures/demo-project.json' } as any, scenario, runtimeScope);
        return send(res, result.run.status === 'succeeded' ? 200 : result.run.status === 'waiting_user' ? 202 : 422, {
          id: result.run.id,
          runId: result.run.id,
          run: result.run,
          status: result.status,
          provider: 'fixture-tool-loop',
          isMock: true,
          events: result.events,
          artifact: result.artifact ?? null,
          approval: result.approval ?? null,
          error: result.error ?? null,
        });
      }
      if (input.provider === 'tool-loop-local') {
        const result = await executeLocalToolLoopRun(String(input.goal ?? '用本地只读工具完成一次回放'), { idea: input.goal ?? '', path: input.path ?? 'fixtures/demo-project.json' } as any, runtimeScope);
        return send(res, result.run.status === 'succeeded' ? 200 : 422, {
          id: result.run.id,
          runId: result.run.id,
          run: result.run,
          status: result.status,
          provider: 'tool-loop-local',
          isMock: true,
          events: result.events,
          artifact: result.artifact ?? null,
          error: result.error ?? null,
        });
      }
      if (input.provider === 'deepseek-tool-loop') {
        if (!process.env.DEEPSEEK_API_KEY) return send(res, 503, { error: 'deepseek_api_key_missing', message: 'DeepSeek API key is not configured for this local server.' });
        const result = await executeDeepSeekToolLoopRun(String(input.goal ?? '用 DeepSeek 检查一个项目文件'), { idea: input.goal ?? '', path: input.path ?? 'fixtures/demo-project.json' } as any, runtimeScope);
        return send(res, result.run.status === 'succeeded' ? 200 : 422, {
          id: result.run.id,
          runId: result.run.id,
          run: result.run,
          status: result.status,
          provider: 'deepseek-tool-loop',
          isMock: false,
          events: result.events,
          artifact: result.artifact ?? null,
          error: result.error ?? null,
        });
      }
      if (input.provider === 'tool-fixture') {
        const result = await executeFixtureToolRun(
          String(input.goal ?? '验证受控工具调用'),
          { idea: input.goal ?? '', path: input.path ?? 'fixtures/demo-project.json' } as any,
          runtimeScope,
        );
        return send(res, result.run.status === 'succeeded' ? 200 : 422, {
          id: result.run.id,
          runId: result.run.id,
          run: result.run,
          status: result.run.status,
          provider: 'tool-fixture',
          isMock: true,
          events: [result.startEvent, ...result.toolEvents, ...(await runtimeStore.listEvents(result.run.id)).filter((event) => event.type === 'run.succeeded' || event.type === 'run.failed')],
          receipt: result.receipt,
          output: result.output,
        });
      }
      if (input.provider === 'tool-local') {
        const result = await executeLocalFileReadRun(
          String(input.goal ?? '读取项目文件'),
          { path: input.path ?? 'fixtures/demo-project.json', maxBytes: input.maxBytes ?? 64_000 } as any,
          runtimeScope,
        );
        return send(res, result.run.status === 'succeeded' ? 200 : 422, {
          id: result.run.id,
          runId: result.run.id,
          run: result.run,
          status: result.run.status,
          provider: 'tool-local',
          isMock: false,
          events: [result.startEvent, ...result.toolEvents, ...(await runtimeStore.listEvents(result.run.id)).filter((event) => event.type === 'run.succeeded' || event.type === 'run.failed')],
          receipt: result.receipt,
          output: result.output,
        });
      }
      if (input.provider === 'tool-git') {
        const result = await executeLocalGitStatusRun(String(input.goal ?? '查看项目 Git 状态'), runtimeScope);
        return send(res, result.run.status === 'succeeded' ? 200 : 422, {
          id: result.run.id,
          runId: result.run.id,
          run: result.run,
          status: result.run.status,
          provider: 'tool-git',
          isMock: false,
          events: [result.startEvent, ...result.toolEvents, ...(await runtimeStore.listEvents(result.run.id)).filter((event) => event.type === 'run.succeeded' || event.type === 'run.failed')],
          receipt: result.receipt,
          output: result.output,
        });
      }
      if (input.provider === 'tool-git-diff') {
        const result = await executeLocalGitDiffStatRun(String(input.goal ?? '查看项目 Git diff 摘要'), runtimeScope);
        return send(res, result.run.status === 'succeeded' ? 200 : 422, {
          id: result.run.id,
          runId: result.run.id,
          run: result.run,
          status: result.run.status,
          provider: 'tool-git-diff',
          isMock: false,
          events: [result.startEvent, ...result.toolEvents, ...(await runtimeStore.listEvents(result.run.id)).filter((event) => event.type === 'run.succeeded' || event.type === 'run.failed')],
          receipt: result.receipt,
          output: result.output,
        });
      }
      const coreRun = await createRuntimeRun(String(input.goal ?? '未命名目标'), runtimeScope);
      return send(res, 201, { id: coreRun.run.id, coreRun: coreRun.run, status: coreRun.run.status, goal: input.goal ?? '', provider: input.provider ?? 'fixture', events: [coreRun.event] });
    }
    if (req.method === 'POST' && /^\/api\/runs\/[^/]+\/cancel$/.test(url.pathname)) {
      const runId = url.pathname.split('/')[3];
      const controlledCancellation = await cancelControlledCommandRun(runId);
      if (controlledCancellation) {
        const stores = await defaultProductBuilderContinuityStores(dataDir);
        try {
          const pending = stores.entityStore?.listApprovals().find((item) => String(item.runId) === runId && item.status === 'pending' && item.metadata?.kind === 'controlled_command');
          if (pending && stores.entityStore) stores.entityStore.revokeApprovalById(String(pending.id), 'user', '用户取消受控命令');
        } finally { stores.close?.(); }
        return send(res, 200, controlledCancellation as any);
      }
      const cancellation = await cancelCodexRun(runId);
      if (!cancellation) return send(res, 404, { error: 'run_not_found', runId });
      return send(res, 200, cancellation as any);
    }
    const approvalRevokeMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/approvals\/([^/]+)\/revoke$/);
    if (req.method === 'POST' && approvalRevokeMatch) {
      const runId = decodeURIComponent(approvalRevokeMatch[1]);
      const approvalId = decodeURIComponent(approvalRevokeMatch[2]);
      const input = await body(req);
      const reason = typeof input.reason === 'string' && input.reason.trim().length > 0 ? input.reason.trim() : '用户撤销工具授权';
      const stores = await defaultProductBuilderContinuityStores(dataDir);
      try {
        if (!stores.entityStore) return send(res, 503, { error: 'sqlite_entity_store_unavailable', reason: 'Authorization revoke requires the SQLite operational backend.' });
        const approval = stores.entityStore.getApproval(approvalId);
        if (!approval) return send(res, 404, { error: 'approval_not_found', runId, approvalId });
        if (String(approval.runId) !== runId) return send(res, 409, { error: 'approval_run_mismatch', runId, approvalId });
        const revoked = stores.entityStore.revokeApprovalById(approvalId, 'user', reason);
        if (revoked.conflict === 'not_revocable') return send(res, 409, { error: 'approval_not_revocable', runId, approvalId, approval: revoked.approval });
        const current = await runtimeStore.getRun(runId as any);
        let event: any = null;
        const callId = typeof approval.metadata?.callId === 'string' ? approval.metadata.callId : approvalId.split(':approval:')[1];
        const policyVersion = approval.metadata && typeof approval.metadata.policyVersion === 'number' ? approval.metadata.policyVersion : 1;
        const data = { approvalId, callId: callId ?? null, policyVersion, reason, semanticKey: `approval-revoked:${approvalId}` } as any;
        if (revoked.changed && current) {
          const events = await runtimeStore.listEvents(current.id);
          event = createRunEvent(current.id as any, 'tool.authorization_revoked', data, events.length + 1, { type: 'user' });
          await runtimeStore.appendEvent(event);
        } else if (revoked.changed) {
          const continuityEvents = (await stores.eventLog.readAll()).filter((item) => String(item.runId) === runId);
          await stores.eventLog.append({ id: `${approvalId}:authorization-revoked`, runId, sequence: continuityEvents.length + 1, type: 'tool.authorization_revoked', occurredAt: new Date().toISOString(), actor: { type: 'user' }, data });
        }
        return send(res, 200, { ok: true, runId, approvalId, changed: revoked.changed, idempotent: !revoked.changed, approval: revoked.approval, event, runStatus: current?.status ?? 'continuity_only' });
      } finally {
        stores.close?.();
      }
    }
    const approvalResolveMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/approvals\/([^/]+)\/resolve$/);
    if (req.method === 'POST' && approvalResolveMatch) {
      const runId = decodeURIComponent(approvalResolveMatch[1]);
      const approvalId = decodeURIComponent(approvalResolveMatch[2]);
      const input = await body(req);
      const decision = input.decision === 'approved' || input.decision === 'rejected' ? input.decision : undefined;
      if (!decision) return send(res, 400, { error: 'approval_decision_required', runId, approvalId });
      const stores = await defaultProductBuilderContinuityStores(dataDir);
      let approval: any;
      let changed = false;
      let resolvedEvent: any = null;
      let productBuilderState: any = null;
      try {
        if (!stores.entityStore) return send(res, 503, { error: 'sqlite_entity_store_unavailable', reason: 'Approval resolution requires the SQLite operational backend.' });
        approval = stores.entityStore.getApproval(approvalId);
        if (!approval) return send(res, 404, { error: 'approval_not_found', runId, approvalId });
        if (String(approval.runId) !== runId) return send(res, 409, { error: 'approval_run_mismatch', runId, approvalId });
        const resolved = stores.entityStore.resolveApprovalById(approvalId, decision, 'user', typeof input.reason === 'string' ? input.reason : 'HTTP approval resolve');
        const isControlledCommandApproval = approval.metadata?.kind === 'controlled_command';
        if (resolved.conflict) {
          if (isControlledCommandApproval) return send(res, 200, { ok: true, runId, approvalId, decision, changed: false, idempotent: true, approval: resolved.approval ?? approval, run: await runtimeStore.getRun(runId as any), events: await runtimeStore.listEvents(runId as any) });
          return send(res, 409, { error: 'approval_already_resolved', runId, approvalId, approval: resolved.approval });
        }
        approval = resolved.approval ?? approval;
        changed = resolved.changed;
        const run = await runtimeStore.getRun(runId as any);
        if (approval.metadata?.kind === 'bot_policy') {
          const botId = typeof approval.metadata.botId === 'string' ? approval.metadata.botId : '';
          const policyPatch = approval.metadata.patch && typeof approval.metadata.patch === 'object' && !Array.isArray(approval.metadata.patch)
            ? approval.metadata.patch as Record<string, unknown>
            : {};
          if (!stores.entityStore || !botId) return send(res, 422, { error: 'bot_policy_approval_invalid', runId, approvalId });
          const existingBot = stores.entityStore.getBotProfile(botId, String(approval.projectId));
          if (!existingBot) return send(res, 404, { error: 'bot_not_found', botId, projectId: approval.projectId });
          const beforePolicy = Object.fromEntries(BOT_POLICY_FIELDS.map((field) => [field, existingBot[field]])) as any;
          const afterPolicy = decision === 'approved' ? { ...beforePolicy, ...policyPatch } : beforePolicy;
          if (changed) {
            stores.entityStore.appendPolicyAudit({
              id: `policy-audit:${approvalId}:${decision}`,
              projectId: String(approval.projectId),
              botId,
              runId,
              approvalId,
              changedFields: Object.keys(policyPatch),
              beforePolicy,
              afterPolicy,
              decision,
              actor: 'user',
              reason: typeof input.reason === 'string' ? input.reason : undefined,
              createdAt: new Date().toISOString(),
            });
          }
          if (changed && decision === 'approved') {
            const updatedBot = {
              ...existingBot,
              ...policyPatch,
              id: existingBot.id,
              projectId: existingBot.projectId,
              createdAt: existingBot.createdAt,
              updatedAt: new Date().toISOString(),
            } as BotProfile;
            stores.entityStore.saveBotProfile(updatedBot);
            if (run) {
              const events = await runtimeStore.listEvents(run.id);
              resolvedEvent = createRunEvent(run.id as any, 'bot.policy.updated', { approvalId, botId, projectId: approval.projectId, changedFields: Object.keys(policyPatch), idempotencyKey: `bot-policy:${approvalId}:approved` }, events.length + 1, { type: 'user' });
              await runtimeStore.appendEvent(resolvedEvent);
              if (run.status === 'waiting_user') await runtimeStore.transition(run.id, 'resume', { reason: 'Bot 策略审批通过' });
              await runtimeStore.transition(run.id, 'succeed', { result: { botId, projectId: approval.projectId, changedFields: Object.keys(policyPatch), approvalId } });
            }
          } else if (changed && decision === 'rejected' && run) {
            if (run.status === 'waiting_user') await runtimeStore.transition(run.id, 'resume', { reason: 'Bot 策略审批拒绝' });
            await runtimeStore.transition(run.id, 'fail', { reason: 'Bot 策略审批被拒绝', error: { code: 'bot_policy_approval_rejected', message: 'Bot 策略审批被拒绝', retryable: false } });
          }
          return send(res, 200, { ok: decision === 'approved', runId, approvalId, decision, changed, idempotent: !changed, approval, bot: decision === 'approved' ? stores.entityStore.getBotProfile(botId, String(approval.projectId)) : existingBot, event: resolvedEvent, policyAudit: { kind: 'bot_policy', changedFields: Object.keys(policyPatch) }, run: await runtimeStore.getRun(runId as any), events: await runtimeStore.listEvents(runId as any) });
        }
        const callId = typeof approval.metadata?.callId === 'string' ? approval.metadata.callId : approvalId.split(':approval:')[1];
        if (changed && run && (callId || approval.metadata?.kind === 'controlled_command')) {
          const events = await runtimeStore.listEvents(run.id);
          resolvedEvent = createRunEvent(run.id as any, 'approval.resolved', { ...approval, approvalId, callId, decision, idempotencyKey: input.idempotencyKey ?? `approval:${approvalId}:${decision}` } as any, events.length + 1, { type: 'user' });
          await runtimeStore.appendEvent(resolvedEvent);
        }
        if (!isControlledCommandApproval) productBuilderState = await reconcileProductBuilderRelease({ projectId: String(approval.projectId ?? 'project-product-builder') as any, runId: runId as any }, stores);
      } finally {
        stores.close?.();
      }
      if (approval.metadata?.kind === 'controlled_command') {
        if (decision === 'rejected') {
          const cancelled = await cancelControlledCommandRun(runId);
          return send(res, 200, { ok: true, runId, approvalId, decision, changed, idempotent: !changed, approval, event: resolvedEvent, controlledCommand: cancelled ? { status: cancelled.status, run: cancelled.run, events: await runtimeStore.listEvents(runId as any) } : null });
        }
        try {
          const command = await executeControlledCommandRun(runId, approval);
          if (!command) return send(res, 404, { error: 'controlled_command_run_not_found', runId, approvalId });
          return send(res, command.run.status === 'succeeded' ? 200 : command.run.status === 'cancelled' ? 200 : 422, { ok: command.run.status === 'succeeded', runId, approvalId, decision, changed, idempotent: !changed, approval, event: resolvedEvent, controlledCommand: { status: command.run.status, profile: controlledCommandProfileView(command.profile), receipt: command.command.receipt, output: command.command.output ?? null, run: command.run, events: command.events } });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return send(res, 422, { error: 'controlled_command_execution_failed', runId, approvalId, message, approval });
        }
      }
      const current = await runtimeStore.getRun(runId as any);
      const shouldResume = Boolean(current && current.status === 'waiting_user' && approval.status !== 'pending');
      const resumed = shouldResume ? await resumePersistedFixtureToolLoop(runId, approvalId) : undefined;
      return send(res, resumed?.run.status === 'failed' ? 422 : resumed?.run.status === 'waiting_user' ? 202 : 200, {
        ok: true,
        runId,
        approvalId,
        decision,
        changed,
        idempotent: !changed,
        approval,
        event: resolvedEvent,
        productBuilder: productBuilderState,
        artifactRelease: productBuilderState?.artifactRelease ?? null,
        finalArtifactIds: productBuilderState?.finalArtifactIds ?? [],
        resumed: resumed ? { status: resumed.status, run: resumed.run, events: resumed.events, artifact: resumed.artifact ?? null, error: resumed.error ?? null } : null,
      });
    }
    if (req.method === 'POST' && /^\/api\/runs\/[^/]+\/(approve|retry)$/.test(url.pathname)) {
      const parts = url.pathname.split('/');
      const runId = parts[3];
      const action = parts[4];
      if (action === 'retry') {
        const input = await body(req);
        const retryMode = input.mode === 'automatic' ? 'automatic' as const : 'manual' as const;
        const requestedIdempotencyKey = typeof input.idempotencyKey === 'string' && input.idempotencyKey.trim().length <= 200
          ? input.idempotencyKey.trim()
          : undefined;
        const current = await runtimeStore.getRun(runId as any);
        if (!current) {
          const stores = await defaultProductBuilderContinuityStores(dataDir);
          try {
            const continuityEvents = (await stores.eventLog.readAll()).filter((item) => String(item.runId) === runId);
            const approvalRecord = stores.entityStore?.listApprovals().find((item) => String(item.runId) === runId);
            if (!approvalRecord || !continuityEvents.length) return send(res, 404, { error: 'run_not_found', runId });
            const existing = requestedIdempotencyKey
              ? continuityEvents.find((item) => String((item as any).data?.idempotencyKey ?? '') === requestedIdempotencyKey)
              : undefined;
            if (existing) return send(res, 200, { ok: true, runId, action, event: existing, alreadyRecorded: true });
            const state = readLatestProductBuilderState(continuityEvents as any, runId);
            if (state?.artifactRelease === 'released') return send(res, 409, { error: 'retry_not_allowed', reason: 'run_succeeded', runId, status: 'succeeded' });
            const attempts = retryAttemptCount(continuityEvents as any);
            if (attempts >= DEFAULT_MAX_RETRIES) return send(res, 409, { error: 'retry_limit_reached', runId, retryCount: attempts, maxRetries: DEFAULT_MAX_RETRIES });
            const attempt = attempts + 1;
            const idempotencyKey = requestedIdempotencyKey ?? `retry:${runId}:attempt:${attempt}`;
            const event = createRunEvent(runId as any, 'run.retry_requested', {
              idempotencyKey,
              reason: '用户请求修改问题后重试',
              retry: { attempt, maxRetries: DEFAULT_MAX_RETRIES, mode: retryMode, reasonClass: classifyRetryReason(undefined, retryMode), previousFailureCode: 'product_builder_state_pending' },
            }, continuityEvents.length + 1, { type: 'user' });
            await stores.eventLog.append(event as any);
            return send(res, 200, { ok: true, runId, action, event, attempt, maxRetries: DEFAULT_MAX_RETRIES });
          } finally {
            stores.close?.();
          }
        }
        const events = await runtimeStore.listEvents(current.id);
        const existing = requestedIdempotencyKey
          ? events.find((event) => String(event.data.idempotencyKey ?? '') === requestedIdempotencyKey)
          : undefined;
        if (existing) return send(res, 200, { ok: true, runId, action, run: current, event: existing, alreadyRecorded: true });
        if (current.status !== 'failed') return send(res, 409, { error: 'retry_not_allowed', reason: current.status === 'succeeded' ? 'run_succeeded' : current.status === 'cancelled' ? 'run_cancelled' : 'run_not_failed', runId, status: current.status });
        if (!current.error?.retryable) return send(res, 409, { error: 'retry_not_allowed', reason: 'failure_not_retryable', runId, status: current.status, failureCode: current.error?.code ?? null });
        const maxRetries = maxRetriesForRun(current);
        const retryCount = retryAttemptCount(events);
        if (retryCount >= maxRetries) return send(res, 409, { error: 'retry_limit_reached', runId, retryCount, maxRetries });
        const attempt = retryCount + 1;
        const idempotencyKey = requestedIdempotencyKey ?? `retry:${runId}:attempt:${attempt}`;
        try {
          const transition = await runtimeStore.transition(runId as any, 'retry', {
            actor: { type: 'user' },
            reason: retryMode === 'automatic' ? '自动重试' : '用户请求重试',
            idempotencyKey,
            retry: { attempt, maxRetries, mode: retryMode, reasonClass: classifyRetryReason(current.error, retryMode), previousFailureCode: current.error.code },
          });
          if (current.request.metadata?.provider === 'fixture-tool-loop') {
            const resumed = await resumeFixtureToolLoop(runId, { scenario: String(current.request.metadata?.scenario ?? 'normal') as any });
            return send(res, resumed.run.status === 'succeeded' ? 200 : resumed.run.status === 'waiting_user' ? 202 : 422, {
              ok: resumed.run.status === 'succeeded',
              runId,
              action,
              run: resumed.run,
              event: transition.event,
              events: resumed.events,
              executionDispatched: true,
              attempt,
              maxRetries,
            });
          }
          return send(res, 200, { ok: true, runId, action, run: transition.run, event: transition.event, executionDispatched: false, message: '已重新排队，当前 Provider 没有本地执行器可立即派发。', attempt, maxRetries });
        } catch (error) {
          if (error instanceof RetryBudgetExceededError) return send(res, 409, { error: 'retry_limit_reached', runId, retryCount: error.attempts, maxRetries: error.maxRetries });
          if (error instanceof Error && error.name === 'InvalidRunTransitionError') return send(res, 409, { error: 'invalid_run_transition', runId, action, status: current.status, message: error.message });
          throw error;
        }
      }
      let approvalRowsUpdated = 0;
      let event: unknown = null;
      if (action === 'approve') {
        const stores = await defaultProductBuilderContinuityStores(dataDir);
        try {
          const pendingApprovals = stores.entityStore?.listApprovals().filter((item) => String(item.runId) === runId && item.status === 'pending') ?? [];
          if (pendingApprovals.length > 1) return send(res, 409, { error: 'approval_id_required', runId, pendingApprovalIds: pendingApprovals.map((item) => item.id) });
          const resolved = pendingApprovals[0] && stores.entityStore
            ? stores.entityStore.resolveApprovalById(String(pendingApprovals[0].id), 'approved', 'user', 'HTTP approval route')
            : { changed: false, approval: pendingApprovals[0] };
          approvalRowsUpdated = resolved.changed ? 1 : 0;
          if (approvalRowsUpdated > 0) {
            const events = (await stores.eventLog.readAll()).filter((item) => item.runId === runId);
            event = createRunEvent(runId as any, 'approval.resolved', { approvalRowsUpdated, decision: 'approved', approvalId: pendingApprovals[0].id, callId: pendingApprovals[0].metadata?.callId ?? null }, events.length + 1, { type: 'user' });
            await stores.eventLog.append(event as any);
          }
          const approvalRecord = resolved.approval ?? stores.entityStore?.listApprovals().find((item) => String(item.runId) === runId);
          const releaseState = approvalRowsUpdated > 0
            ? await reconcileProductBuilderRelease({ projectId: (approvalRecord?.projectId ?? 'project-product-builder') as any, runId: runId as any }, stores)
            : undefined;
          return send(res, 200, { ok: true, runId, action, approvalRowsUpdated, event, productBuilder: releaseState ?? null, artifactRelease: releaseState?.artifactRelease ?? null, finalArtifactIds: releaseState?.finalArtifactIds ?? [] });
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
  server.on('error', (error) => {
    console.error('Local Agent Workspace server listen failed', error);
    process.exitCode = 1;
    process.exit(1);
  });
  server.listen(listenPort, '127.0.0.1', () => {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Local server has no TCP address');
    console.log(`Local Agent Workspace server listening at http://127.0.0.1:${address.port}`);
    if (process.send) process.send({ type: 'workspace-server-ready', port: address.port, pid: process.pid });
  });
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) startServer();
