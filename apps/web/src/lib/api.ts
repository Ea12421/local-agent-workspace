export type RunStatus = '排队中' | '运行中' | '等待确认' | '已完成' | '失败' | '已取消'

export type Project = {
  id: string
  name: string
  description: string
  workspacePath?: string
  updatedAt: string
  botCount: number
  activeRun?: string
}

export type ProjectCreateInput = {
  name: string
  description?: string
  workspacePath: string
}

export type Bot = {
  id: string
  name: string
  role: string
  initials: string
  color: string
  status: '运行中' | '待机'
  provider: string
  permission: string
  skills: string[]
  enabled?: boolean
}

export type BotProfileRecord = {
  id: string
  projectId: string
  name: string
  description: string
  responsibility: string
  inputSchema: Record<string, unknown>
  outputSchema: Record<string, unknown>
  skillIds: string[]
  toolPolicy: Record<string, unknown>
  providerPolicy: Record<string, unknown>
  memoryPolicy: Record<string, unknown>
  approvalPolicy: Record<string, unknown>
  enabled: boolean
  createdAt: string
  updatedAt: string
  disabledAt?: string
}

export type SkillRecord = {
  id: string
  name: string
  description: string
  version: string
  instructions: string
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  enabled: boolean
}

export type SkillCreateInput = {
  name: string
  description: string
  version: string
  instructions: string
}

export type BotCreateInput = {
  projectId: string
  name: string
  description: string
  responsibility: string
}

export type RunEvent = {
  id: string
  label: string
  detail: string
  time: string
  kind: 'done' | 'active' | 'waiting' | 'failed' | 'next'
  bot?: string
}

export type Artifact = {
  id: string
  name: string
  type: 'PDF' | 'MD' | 'JSON'
  meta: string
  status: '已生成' | '草稿'
  runId?: string
  createdAt?: string
}

export type ProviderModelReceipt = {
  id: string
  runId: string
  segment?: number
  createdAt?: string
  provider: {
    harness: string
    provider: string
    model: string
    authMode: string
    billingSource: string
    isMock: boolean
  }
  requestId?: string | null
  rawResponseRef?: string | null
  usage: {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
    cachedInputTokens?: number
    estimatedCostCents?: number
    source: 'provider' | 'estimated' | 'unknown' | string
  }
  promptCache: {
    status: 'not_requested' | 'unknown' | 'unsupported' | 'miss' | 'hit' | 'written' | string
    providerReported: boolean
    cachedInputTokens?: number
  }
  finishReason?: string | null
  error?: { code?: string; message?: string; retryable?: boolean } | null
  providerFields?: Record<string, unknown> | null
  replayRef: string
  eventsRef: string
}

export type ProductBuilderClarification = {
  id: string
  label: string
  value?: string
  sourceRefs: string[]
  blocking: boolean
  status: 'provided' | 'unknown' | string
}

export type ProductBuilderPlanStep = {
  id: string
  label: string
  ownerBotId: string
  dependsOn: string[]
  status: 'ready' | 'blocked' | 'waiting_user' | string
}

export type ProductBuilderProjection = {
  runId: string
  artifactRelease: 'blocked' | 'released' | string
  releaseBlockers: string[]
  clarifications: ProductBuilderClarification[]
  plan: { id: string; steps: ProductBuilderPlanStep[]; unresolvedClarificationIds: string[] }
}

export type ArtifactDetail = {
  id: string
  projectId: string
  runId: string
  kind: string
  name: string
  contentType: string
  content: string
  sourceRefs: string[]
  createdAt: string
  releaseStatus: 'draft' | 'final' | 'unknown'
  releaseState?: { releaseBlockers: string[]; finalArtifactIds: string[] } | null
}

export type SourceDetail = {
  id: string
  projectId: string
  uri: string
  title?: string
  excerpt?: string
  retrievedAt: string
}

export type WorkspaceSnapshot = {
  source?: 'local' | 'fixture'
  projects: Project[]
  bots: Bot[]
  run: {
    id: string
    title: string
    status: RunStatus
    startedAt: string
    elapsed: string
    progress: number
    events: RunEvent[]
    receipt?: { id: string; status: string; eventCount: number; isMock: boolean; modelReceipt?: ProviderModelReceipt }
  }
  artifacts: Artifact[]
  provider: {
    name: string
    model: string
    authMode: string
    billingSource: string
    healthy: boolean
    latency: string
    modelReceipt?: ProviderModelReceipt
  }
  approval?: { id: string; runId: string; status: string; action?: string; description?: string; permissionTier?: string } | null
  productBuilder?: ProductBuilderProjection
  providerConnections?: ProviderConnectionRecord[]
  providerBindings?: ProviderBindingRecord[]
  sessions?: SessionRecord[]
}

export type ProviderConnectionRecord = {
  id: string
  label: string
  provider: 'codex' | 'deepseek' | 'fixture' | string
  harness: string
  authMode: string
  billingSource: string
  secretRef?: { kind: 'env'; name: string } | { kind: 'cli'; profile: string }
  status: 'unconfigured' | 'available' | 'blocked' | 'error' | string
  capabilities?: Record<string, unknown>
  lastProbeAt?: string
  createdAt: string
  updatedAt: string
}

export type ProviderBindingRecord = {
  id: string
  projectId: string
  connectionId: string
  model: string
  role: 'primary' | 'fallback' | string
  priority: number
  enabled: boolean
  fallbackPolicy: 'never' | 'on_retryable_failure' | string
  revision: number
  createdAt: string
  updatedAt: string
}

export type SessionRecord = {
  id: string
  projectId: string
  botId: string
  title: string
  status: 'active' | 'archived' | string
  contextSnapshotId?: string
  createdAt: string
  updatedAt: string
}

export type SessionMessageRecord = {
  id: string
  sessionId: string
  sequence: number
  role: 'user' | 'assistant' | 'system' | 'tool' | string
  content: string
  runId?: string
  createdAt: string
}

export type SessionRunResult = {
  idempotent: boolean
  session: SessionRecord
  run: { id: string; projectId: string; botId: string; status: string; request?: Record<string, unknown>; error?: { message?: string } }
  userMessage: SessionMessageRecord
  assistantMessage?: SessionMessageRecord
  messages: SessionMessageRecord[]
  events?: Array<Record<string, unknown>>
  error?: Record<string, unknown> | null
}

export type ProviderConnectionInput = {
  label: string
  provider: 'codex' | 'deepseek' | 'fixture'
  harness: string
  authMode: string
  billingSource: string
  secretRef?: { kind: 'env'; name: string } | { kind: 'cli'; profile: string }
  status?: string
}

export type ProviderBindingInput = {
  projectId: string
  connectionId: string
  model: string
  role?: 'primary' | 'fallback'
  priority?: number
  fallbackPolicy?: 'never' | 'on_retryable_failure'
}

function uiEventTime(value: unknown): string {
  const raw = String(value ?? '')
  return raw.includes('T') ? raw.slice(11, 19) : raw || '—'
}

function mapPersistedRunEvents(items: Array<Record<string, any>>): RunEvent[] {
  const mapped: RunEvent[] = []
  const eventLabels: Record<string, string> = {
    'handoff.created': '创建 Bot 交接',
    'handoff.completed': 'Bot 交接完成',
    'handoff.succeeded': 'Bot 交接完成',
    'artifact.created': '生成 Artifact',
    'approval.requested': '等待用户确认',
    'approval.resolved': '用户确认继续',
    'approval.approved': '用户确认继续',
    'run.created': '创建运行',
    'run.started': '开始运行',
    'run.retry_requested': '已请求重试',
    'tool.invoked': '调用受控工具',
    'tool.completed': '工具调用完成',
    'tool.failed': '工具调用失败',
    'run.succeeded': '运行完成',
    'run.failed': '运行失败',
    'run.cancelled': '运行已取消',
  }
  for (const item of items) {
    const type = String(item.type ?? '')
    const data = item.data ?? {}
    if (type === 'context.snapshot_created' || type === 'product_builder.state_checkpoint') continue
    const label = String(data.label ?? '')
    const toolSummary = type.startsWith('tool.')
      ? `${String(data.tool ?? 'tool')} · ${String(data.operation ?? 'operation')} · ${String(data.status ?? (type === 'tool.failed' ? 'failed' : 'recorded'))}`
      : ''
    const detail = toolSummary || String(data.objective ?? data.reason ?? data.description ?? data.label ?? eventLabels[type] ?? type)
    const event: RunEvent = {
      id: String(item.id ?? `${type}-${item.sequence ?? mapped.length + 1}`),
      label: label || eventLabels[type] || type,
      detail,
      time: uiEventTime(item.occurredAt ?? item.at),
      kind: type === 'approval.requested' ? 'waiting' : type.endsWith('.failed') || type === 'run.failed' ? 'failed' : 'done',
      bot: type.startsWith('handoff.') ? String(data.toBotId ?? 'Product Builder') : 'Product Builder',
    }
    mapped.push(event)
  }
  return mapped
}

export type ProviderChoice = 'bound' | 'fixture' | 'codex' | 'deepseek-tool-loop' | 'deepseek-product-builder-draft' | 'tool-fixture' | 'tool-loop-fixture' | 'tool-loop-local' | 'tool-local' | 'tool-git' | 'tool-git-diff' | 'controlled-command'

export type StartRunRequest = {
  provider: ProviderChoice
  objective: string
  projectId?: string
  commandId?: 'project.test' | 'project.build_web'
}

export type StartRunResult = {
  ok: boolean
  provider: ProviderChoice
  isMock: boolean
  runId?: string
  status?: string
  eventCount?: number
  artifactCount?: number
  receiptId?: string
  output?: string
  error?: string
  modelReceipt?: ProviderModelReceipt
  approval?: { id: string; runId: string; status: string; action?: string; description?: string; permissionTier?: string }
  command?: { id: string; label: string; argv: string[]; declaredEffects: string[]; approvalRequired: boolean }
}

export type ImprovementTarget = 'prompt' | 'skill' | 'memory_policy' | 'tool_policy' | 'provider' | 'code' | 'bot' | 'routine'
export type MemoryRecallStrategy = 'lexical' | 'hybrid'

export type ImprovementProjection = {
  runId: string
  projectId?: string
  target?: ImprovementTarget
  status: 'not_started' | 'running' | 'waiting_user' | 'published' | 'rolled_back' | 'rejected' | 'failed' | string
  proposal?: {
    candidateVersion: string
    baseVersion: string
    candidateHash: string
    target: ImprovementTarget
    status: string
    hypothesis: string
    memoryRefs?: string[]
    memoryStrategy?: MemoryRecallStrategy
  }
  evaluation?: { status: 'passed' | 'failed' | 'unscored' | string; baselineScore: number; candidateScore: number; evaluatorVersion: string; assertions: Array<{ id: string; passed: boolean }> }
  approval?: { approvalId: string; status: string; action: string; reason?: string }
  release?: { releasedVersion: string; automatic: boolean; publishedAt: string }
  rollback?: { restoredVersion: string; rolledBackVersion: string; reason: string; rolledBackAt: string }
  error?: { code: string; message: string }
}

export type ImprovementRunResponse = {
  runId: string
  run?: { id: string; status: string }
  projection: ImprovementProjection
  evaluationBundle?: {
    task: { taskId: string; version: string; name: string; objective: string }
    score: { status: string; value: number; maxValue: number; dimensions: Array<{ id: string; passed: boolean; value: number; maxValue: number }> }
    feedback: { kind: string; summary: string; details?: string; sourceRefs: string[] }
  }
  artifacts?: Array<Record<string, unknown>>
  approvals?: Array<Record<string, unknown>>
  idempotent?: boolean
}

function mapProductBuilderProjection(item: Record<string, any> | undefined): ProductBuilderProjection | undefined {
  if (!item || !Array.isArray(item.clarifications) || !item.plan || !Array.isArray(item.plan.steps)) return undefined
  return {
    runId: String(item.runId ?? ''),
    artifactRelease: String(item.artifactRelease ?? 'blocked'),
    releaseBlockers: Array.isArray(item.releaseBlockers) ? item.releaseBlockers.map(String) : [],
    clarifications: item.clarifications.map((clarification: Record<string, any>) => ({
      id: String(clarification.id),
      label: String(clarification.label ?? clarification.id),
      ...(clarification.value === undefined ? {} : { value: String(clarification.value) }),
      sourceRefs: Array.isArray(clarification.sourceRefs) ? clarification.sourceRefs.map(String) : [],
      blocking: Boolean(clarification.blocking),
      status: String(clarification.status ?? 'unknown'),
    })),
    plan: {
      id: String(item.plan.id ?? 'product-builder-plan-v1'),
      unresolvedClarificationIds: Array.isArray(item.plan.unresolvedClarificationIds) ? item.plan.unresolvedClarificationIds.map(String) : [],
      steps: item.plan.steps.map((step: Record<string, any>) => ({
        id: String(step.id), label: String(step.label ?? step.id), ownerBotId: String(step.ownerBotId ?? ''),
        dependsOn: Array.isArray(step.dependsOn) ? step.dependsOn.map(String) : [], status: String(step.status ?? 'blocked'),
      })),
    },
  }
}

function mapProviderModelReceipt(item: Record<string, any> | undefined): ProviderModelReceipt | undefined {
  if (!item?.id || !item?.runId) return undefined
  const response = item.receipt ?? item
  if (response.schemaVersion && response.schemaVersion !== 'provider.model-response.v1') return undefined
  const provider = item.provider ?? response.provider
  if (!provider?.provider || !provider?.model) return undefined
  return {
    id: String(item.id),
    runId: String(item.runId),
    ...(item.segment === undefined ? {} : { segment: Number(item.segment) }),
    ...(item.createdAt ? { createdAt: String(item.createdAt) } : {}),
    provider: {
      harness: String(provider.harness ?? 'unknown'),
      provider: String(provider.provider),
      model: String(provider.model),
      authMode: String(provider.authMode ?? 'unknown'),
      billingSource: String(provider.billingSource ?? 'unknown'),
      isMock: Boolean(provider.isMock),
    },
    requestId: response.requestId === undefined ? null : String(response.requestId),
    rawResponseRef: response.rawResponseRef === undefined ? null : String(response.rawResponseRef),
    usage: {
      ...(response.usage?.inputTokens === undefined ? {} : { inputTokens: Number(response.usage.inputTokens) }),
      ...(response.usage?.outputTokens === undefined ? {} : { outputTokens: Number(response.usage.outputTokens) }),
      ...(response.usage?.totalTokens === undefined ? {} : { totalTokens: Number(response.usage.totalTokens) }),
      ...(response.usage?.cachedInputTokens === undefined ? {} : { cachedInputTokens: Number(response.usage.cachedInputTokens) }),
      ...(response.usage?.estimatedCostCents === undefined ? {} : { estimatedCostCents: Number(response.usage.estimatedCostCents) }),
      source: String(response.usage?.source ?? 'unknown'),
    },
    promptCache: {
      status: String(response.promptCache?.status ?? 'unknown'),
      providerReported: Boolean(response.promptCache?.providerReported),
      ...(response.promptCache?.cachedInputTokens === undefined ? {} : { cachedInputTokens: Number(response.promptCache.cachedInputTokens) }),
    },
    finishReason: response.finishReason === undefined ? null : String(response.finishReason),
    error: response.error ? { code: response.error.code ? String(response.error.code) : undefined, message: response.error.message ? String(response.error.message) : undefined, retryable: response.error.retryable === undefined ? undefined : Boolean(response.error.retryable) } : null,
    providerFields: response.providerFields && typeof response.providerFields === 'object' ? response.providerFields : null,
    replayRef: String(item.replayRef ?? `/api/core/runs/${encodeURIComponent(String(item.runId))}?receiptId=${encodeURIComponent(String(item.id))}`),
    eventsRef: String(item.eventsRef ?? `/api/runs/${encodeURIComponent(String(item.runId))}/events`),
  }
}

function isProductBuilderReceipt(item: Record<string, any>): boolean {
  const id = String(item?.id ?? '')
  return id.includes(':product-builder:') || id.includes(':deepseek-product-builder-draft:')
}

function providerChoiceFromRuntime(run: Record<string, any>): ProviderChoice {
  const metadataProvider = String(run.request?.metadata?.provider ?? '')
  const resultProvider = typeof run.result?.provider === 'string' ? String(run.result.provider) : String(run.result?.provider?.provider ?? '')
  const provider = metadataProvider || resultProvider
  if (provider === 'deepseek-product-builder-draft' || resultProvider === 'deepseek') return 'deepseek-product-builder-draft'
  if (provider === 'deepseek-tool-loop') return 'deepseek-tool-loop'
  if (provider === 'tool-loop-local') return 'tool-loop-local'
  if (provider === 'tool-local') return 'tool-local'
  if (provider === 'tool-git-diff') return 'tool-git-diff'
  if (provider === 'tool-git') return 'tool-git'
  if (provider === 'tool-fixture') return 'tool-fixture'
  if (provider === 'tool-loop-fixture') return 'tool-loop-fixture'
  if (provider === 'controlled-command') return 'controlled-command'
  if (run.result?.provider?.harness === 'codex-cli') return 'codex'
  return 'fixture'
}

export type CodexProbe = {
  status: 'available' | 'blocked_environment' | 'unavailable' | 'error'
  version?: string
  detail?: string
  reason?: string
  capabilities?: { execJson?: boolean; resume?: boolean; appServer?: boolean }
  stateDb?: { path?: string; exists?: boolean; fileWritable?: boolean; directoryWritable?: boolean }
}

export const fixtureSnapshot: WorkspaceSnapshot = {
  source: 'fixture',
  projects: [
    { id: 'product-builder', name: 'AI 产品构建器', description: '从想法到可执行方案', workspacePath: 'Fixture 演示目录（不读取真实项目）', updatedAt: '刚刚', botCount: 5, activeRun: '需求拆解与验证' },
    { id: 'content-studio', name: '内容生产工作流', description: '选题、脚本与发布复盘', updatedAt: '昨天', botCount: 3 },
    { id: 'research-lab', name: 'Research Lab', description: '可追溯的研究卡片', updatedAt: '3 天前', botCount: 2 },
  ],
  bots: [
    { id: 'manager', name: '项目总控', role: '拆解目标、调度交接', initials: '总', color: '#5c5ae8', status: '运行中', provider: '本地演示', permission: '只读', skills: ['任务规划', '交接路由'] },
    { id: 'research', name: 'Research Bot', role: '寻找事实并保留来源', initials: '研', color: '#099d82', status: '待机', provider: 'Fixture 本地演示', permission: '只读', skills: ['公开搜索', '来源审计'] },
    { id: 'product', name: 'Product Bot', role: '定义用户、场景与 MVP', initials: '产', color: '#e4873c', status: '待机', provider: 'Fixture 本地演示', permission: '只读', skills: ['产品定义', '冲突检查'] },
    { id: 'architecture', name: 'Architecture Bot', role: '选择可实现的技术路线', initials: '架', color: '#3478c8', status: '待机', provider: 'Fixture 本地演示', permission: '只读', skills: ['架构评估', '成本估算'] },
    { id: 'evaluation', name: 'Evaluation Bot', role: '把成功标准变成可测试规则', initials: '评', color: '#ca568a', status: '待机', provider: '本地演示', permission: '只读', skills: ['质量评分', 'Bad Case'] },
  ],
  run: {
    id: 'run-fixture-001', title: 'AI 视频生成平台 · 首轮方案', status: '等待确认', startedAt: '今天 18:42', elapsed: '02:18', progress: 72,
    events: [
      { id: 'e1', label: '收到产品想法', detail: '用户输入了 1 个目标与 3 个约束', time: '18:42:03', kind: 'done', bot: '项目总控' },
      { id: 'e2', label: '完成任务规划', detail: '拆分为 Research、Product、Architecture、Evaluation', time: '18:42:08', kind: 'done', bot: '项目总控' },
      { id: 'e3', label: 'Research Bot 完成', detail: '找到 6 条公开来源，保留 4 条可用证据', time: '18:43:11', kind: 'done', bot: 'Research Bot' },
      { id: 'e4', label: 'Product Bot 完成', detail: '输出 2 个用户场景与 MVP 边界', time: '18:43:47', kind: 'done', bot: 'Product Bot' },
      { id: 'e5', label: '等待你的确认', detail: '需要确认目标用户：独立创作者，还是企业内容团队？', time: '18:44:21', kind: 'waiting', bot: '项目总控' },
      { id: 'e6', label: 'Architecture Bot', detail: '等待上游确认后继续', time: '—', kind: 'next', bot: 'Architecture Bot' },
    ],
  },
  artifacts: [
    { id: 'artifact-brief', name: 'Product Brief.md', type: 'MD', meta: '目标用户 · MVP 范围', status: '已生成' },
    { id: 'artifact-plan', name: 'Execution Plan.md', type: 'MD', meta: '结构化单 Bot 基线 · 执行计划', status: '已生成' },
    { id: 'a3', name: 'source-ledger.json', type: 'JSON', meta: '可追溯证据账本', status: '已生成' },
    { id: 'a4', name: 'execution-plan.md', type: 'MD', meta: '等待后续节点', status: '草稿' },
  ],
  provider: { name: 'Fixture 本地演示', model: 'deterministic-demo', authMode: '本地 Fixture', billingSource: '无 API 额度', healthy: true, latency: '确定性' },
  approval: { id: 'approval-fixture-001', runId: 'run-fixture-001', status: 'pending', action: '继续 Product Builder 工作流', description: '确认后，Architecture Bot 才会继续设计技术方案。', permissionTier: '只读' },
  productBuilder: {
    runId: 'run-fixture-001',
    artifactRelease: 'blocked', releaseBlockers: ['approval_pending'],
    clarifications: [
      { id: 'target_user', label: '目标用户', value: '独立开发者', sourceRefs: ['source-user-input'], blocking: true, status: 'provided' },
      { id: 'primary_scenario', label: '主要使用场景', value: '在每日内容规划中使用', sourceRefs: ['source-user-input'], blocking: true, status: 'provided' },
      { id: 'success_metric', label: '成功指标', sourceRefs: [], blocking: false, status: 'unknown' },
      { id: 'external_evidence', label: '外部证据来源', sourceRefs: [], blocking: false, status: 'unknown' },
    ],
    plan: { id: 'product-builder-plan-v1', unresolvedClarificationIds: [], steps: [
      { id: 'clarify', label: '确认未知项', ownerBotId: 'bot-product-builder', dependsOn: [], status: 'ready' },
      { id: 'research', label: '补充研究来源', ownerBotId: 'bot-research', dependsOn: ['clarify'], status: 'ready' },
      { id: 'product', label: '定义产品与 MVP', ownerBotId: 'bot-product', dependsOn: ['research'], status: 'ready' },
      { id: 'architecture', label: '评估技术路线', ownerBotId: 'bot-architecture', dependsOn: ['product'], status: 'ready' },
      { id: 'evaluation', label: '建立固定评测', ownerBotId: 'bot-evaluation', dependsOn: ['architecture'], status: 'ready' },
      { id: 'approval', label: '等待用户确认', ownerBotId: 'bot-product-builder', dependsOn: ['evaluation'], status: 'waiting_user' },
      { id: 'release', label: '释放最终产物', ownerBotId: 'bot-product-builder', dependsOn: ['approval'], status: 'blocked' },
    ] },
  },
}

/** API boundary used by the UI. Swap this fixture implementation for the local server client. */
export interface WorkspaceApi {
  getSnapshot(projectId?: string): Promise<WorkspaceSnapshot>
  createProject(input: ProjectCreateInput): Promise<Project>
  getLatestExecution(projectId?: string): Promise<StartRunResult | null>
  probeCodex(): Promise<CodexProbe>
  approveRun(runId: string, approvalId?: string, decision?: 'approved' | 'rejected'): Promise<{ ok: boolean; error?: string }>
  cancelRun(runId: string): Promise<{ ok: boolean; error?: string }>
  replayRun(runId: string, projectId?: string): Promise<{ ok: boolean; error?: string }>
  resolveClarification(runId: string, clarificationId: string, value: string): Promise<{ ok: boolean; error?: string }>
  retryRun(runId: string): Promise<{ ok: boolean; error?: string }>
  startRun(request: StartRunRequest): Promise<StartRunResult>
  startImprovement(input: { projectId: string; target?: ImprovementTarget; reason?: string; idempotencyKey?: string; memoryStrategy?: MemoryRecallStrategy }): Promise<ImprovementRunResponse | { error: string }>
  rollbackImprovement(runId: string, projectId: string, reason?: string): Promise<ImprovementRunResponse | { error: string }>
  getArtifactDetail(id: string, projectId: string): Promise<ArtifactDetail | null>
  getSourceDetail(id: string, projectId: string): Promise<SourceDetail | null>
  listBots(projectId: string): Promise<BotProfileRecord[] | null>
  listSkills(): Promise<SkillRecord[]>
  createSkill(input: SkillCreateInput): Promise<SkillRecord>
  toggleSkill(id: string, enabled: boolean): Promise<SkillRecord>
  setBotSkills(id: string, projectId: string, skillIds: string[]): Promise<BotProfileRecord>
  createProviderConnection(input: ProviderConnectionInput): Promise<ProviderConnectionRecord>
  probeProviderConnection(id: string): Promise<{ ok: boolean; connection?: ProviderConnectionRecord; result?: Record<string, any>; error?: string }>
  createProviderBinding(input: ProviderBindingInput): Promise<ProviderBindingRecord>
  createSession(input: { projectId: string; botId: string; title: string }): Promise<SessionRecord>
  listSessionMessages(sessionId: string, projectId: string): Promise<SessionMessageRecord[]>
  appendSessionMessage(input: { sessionId: string; projectId: string; sequence: number; role: 'user' | 'assistant' | 'system' | 'tool'; content: string }): Promise<SessionMessageRecord>
  runSessionMessage(input: { sessionId: string; projectId: string; content: string; messageId?: string; provider?: 'fixture' | 'bound'; scenario?: 'normal' | 'failure' | 'approval' }): Promise<SessionRunResult>
  createBot(input: BotCreateInput): Promise<BotProfileRecord>
  duplicateBot(id: string, projectId: string): Promise<BotProfileRecord>
  disableBot(id: string, projectId: string): Promise<BotProfileRecord>
}

function defaultBotProfile(input: BotCreateInput, id = `bot-${Date.now()}`): BotProfileRecord {
  const now = new Date().toISOString()
  return {
    id,
    projectId: input.projectId,
    name: input.name,
    description: input.description,
    responsibility: input.responsibility,
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    skillIds: [],
    toolPolicy: { permissionTier: 'read_only', allowedTools: [], approvalRequiredActions: [] },
    providerPolicy: { fallbackEnabled: false },
    memoryPolicy: { readScopes: [], writeScopes: [], requireUserApprovalForWrites: true },
    approvalPolicy: { approvalRequiredActions: [], autoApproveReadOnly: true },
    enabled: true,
    createdAt: now,
    updatedAt: now,
  }
}

export const fixtureApi: WorkspaceApi = {
  async getSnapshot() {
    await new Promise((resolve) => setTimeout(resolve, 160))
    return structuredClone(fixtureSnapshot)
  },
  async createProject(input) {
    const now = new Date().toISOString()
    return { id: `fixture-project-${Date.now()}`, name: input.name, description: input.description ?? '', workspacePath: input.workspacePath, updatedAt: now, botCount: 0 }
  },
  async getLatestExecution() {
    return null
  },
  async probeCodex() {
    return { status: 'unavailable', reason: '当前为离线 Fixture 演示' }
  },
  async approveRun(_runId, _approvalId, _decision = 'approved') {
    await new Promise((resolve) => setTimeout(resolve, 260))
    return { ok: true }
  },
  async resolveClarification(_runId, _clarificationId, _value) {
    await new Promise((resolve) => setTimeout(resolve, 180))
    return { ok: true }
  },
  async retryRun(_runId) {
    await new Promise((resolve) => setTimeout(resolve, 260))
    return { ok: true }
  },
  async cancelRun(_runId) { return { ok: true } },
  async replayRun(_runId) { return { ok: true } },
  async startRun(request) {
    await new Promise((resolve) => setTimeout(resolve, request.provider === 'codex' ? 900 : 260))
    return {
      ok: true,
      provider: request.provider,
      isMock: request.provider === 'fixture',
      runId: `run-fixture-${Date.now()}`,
      status: 'succeeded',
      eventCount: request.provider === 'fixture' ? 6 : 0,
      artifactCount: request.provider === 'fixture' ? 3 : 0,
      output: request.provider === 'fixture' ? 'Fixture 演示已完成。' : undefined,
    }
  },
  async startImprovement() { return { error: '本地服务不可用，无法执行自动更新' } },
  async rollbackImprovement() { return { error: '本地服务不可用，无法回滚' } },
  async getArtifactDetail(id, _projectId) {
    const artifact = fixtureSnapshot.artifacts.find((item) => item.id === id)
    return artifact ? { id: artifact.id, projectId: 'product-builder', runId: fixtureSnapshot.run.id, kind: artifact.name, name: artifact.name, contentType: 'text/markdown', content: `# ${artifact.name}\n\nFixture 预览：${artifact.meta}`, sourceRefs: [], createdAt: new Date().toISOString(), releaseStatus: artifact.status === '草稿' ? 'draft' : 'final', releaseState: null } : null
  },
  async getSourceDetail(id, _projectId) {
    return { id, projectId: 'product-builder', uri: 'workspace://fixture', title: 'Fixture 来源', excerpt: 'Fixture 来源仅用于离线演示。', retrievedAt: new Date().toISOString() }
  },
  async listBots() { return null },
  async listSkills() { return [] },
  async createSkill(input) {
    return { id: `fixture-skill-${Date.now()}`, ...input, enabled: true }
  },
  async toggleSkill(id, enabled) {
    return { id, name: id, description: 'Fixture Skill', version: '1.0.0', instructions: 'Fixture Skill', enabled }
  },
  async setBotSkills(id, projectId, skillIds) {
    return { ...defaultBotProfile({ projectId, name: id, description: 'Fixture Bot', responsibility: 'Fixture Bot' }, id), skillIds }
  },
  async createProviderConnection(input) {
    const now = new Date().toISOString()
    return { id: `fixture-connection-${Date.now()}`, ...input, status: input.status ?? 'available', createdAt: now, updatedAt: now }
  },
  async probeProviderConnection(id) {
    return { ok: id.startsWith('fixture-'), result: { status: id.startsWith('fixture-') ? 'available' : 'unconfigured', reason: '当前为离线 Fixture 演示' } }
  },
  async createProviderBinding(input) {
    const now = new Date().toISOString()
    return { id: `fixture-binding-${Date.now()}`, ...input, role: input.role ?? 'primary', priority: input.priority ?? 0, enabled: true, fallbackPolicy: input.fallbackPolicy ?? 'never', revision: 1, createdAt: now, updatedAt: now }
  },
  async createSession(input) {
    const now = new Date().toISOString()
    return { id: `fixture-session-${Date.now()}`, ...input, status: 'active', createdAt: now, updatedAt: now }
  },
  async listSessionMessages() { return [] },
  async appendSessionMessage(input) { return { id: `fixture-message-${Date.now()}`, ...input, createdAt: new Date().toISOString() } },
  async runSessionMessage(input) {
    const now = new Date().toISOString()
    const runId = `fixture-session-run-${Date.now()}`
    const userMessage = { id: input.messageId ?? `fixture-message-${Date.now()}`, sessionId: input.sessionId, sequence: 1, role: 'user' as const, content: input.content, runId, createdAt: now }
    const assistantMessage = { id: `${userMessage.id}:assistant`, sessionId: input.sessionId, sequence: 2, role: 'assistant' as const, content: '本地受控运行已完成。\n这是离线 Fixture 回放。', runId, createdAt: now }
    return { idempotent: false, session: { id: input.sessionId, projectId: input.projectId, botId: 'fixture-bot', title: 'Fixture 会话', status: 'active', createdAt: now, updatedAt: now }, run: { id: runId, projectId: input.projectId, botId: 'fixture-bot', status: 'succeeded' }, userMessage, assistantMessage, messages: [userMessage, assistantMessage] }
  },
  async createBot(input) { return defaultBotProfile(input, `fixture-bot-${Date.now()}`) },
  async duplicateBot(id, projectId) { return defaultBotProfile({ projectId, name: `复制 Bot ${id}`, description: 'Fixture 复制', responsibility: '执行复制后的职责' }, `fixture-copy-${Date.now()}`) },
  async disableBot(id, projectId) { return { ...defaultBotProfile({ projectId, name: id, description: 'Fixture Bot', responsibility: 'Fixture Bot' }, id), enabled: false } },
}

const browserOrigin = typeof window !== 'undefined' ? window.location.origin : ''
const defaultApiBase = browserOrigin && window.location.port !== '5173' ? browserOrigin : 'http://127.0.0.1:4310'
const localApiBase = (import.meta as any).env?.VITE_API_BASE ?? defaultApiBase

/** Prefer the local control plane; snapshot/detail reads may fall back to Fixture, while run failures stay visible. */
export const workspaceApi: WorkspaceApi = {
  async getSnapshot(projectId) {
    try {
      const response = await fetch(`${localApiBase}/api/ui-snapshot${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`)
      if (!response.ok) throw new Error(`workspace API ${response.status}`)
      const snapshot = await response.json() as WorkspaceSnapshot
      try {
        const entitiesResponse = await fetch(`${localApiBase}/api/persistence/entities?projectId=${encodeURIComponent(snapshot.projects[0]?.id ?? 'project-product-builder')}`)
        if (entitiesResponse.ok) {
          const entities = await entitiesResponse.json() as {
          projects?: Array<Record<string, any>>
          approvals?: Array<Record<string, any>>
          artifacts?: Array<Record<string, any>>
          productBuilderStates?: Array<Record<string, any>>
          receipts?: Array<Record<string, any>>
          modelReceipts?: Array<Record<string, any>>
          providerConnections?: ProviderConnectionRecord[]
          providerBindings?: ProviderBindingRecord[]
          sessions?: SessionRecord[]
        }
          const persistedProject = (entities.projects ?? []).find((item) => String(item.id) === String(snapshot.projects[0]?.id))
          const projects = snapshot.projects.map((item) => item.id === snapshot.projects[0]?.id && persistedProject?.workspacePath
            ? { ...item, workspacePath: String(persistedProject.workspacePath) }
            : item)
          const approval = (entities.approvals ?? [])
          .filter((item) => item?.id && item?.runId)
          .sort((left, right) => String(right.updatedAt ?? right.requestedAt ?? '').localeCompare(String(left.updatedAt ?? left.requestedAt ?? '')) || String(right.id).localeCompare(String(left.id)))[0]
          const statesByRun = new Map((entities.productBuilderStates ?? [])
            .filter((item) => item?.runId)
            .map((item) => [String(item.runId), item]))
          const persistedArtifacts = (entities.artifacts ?? [])
            .filter((item) => item?.id && item?.projectId)
            .map((item): Artifact => {
              const contentType = String(item.contentType ?? '')
              const name = String(item.name ?? item.kind ?? item.id)
              const type: Artifact['type'] = contentType.includes('json') || name.toLowerCase().endsWith('.json')
                ? 'JSON'
                : contentType.includes('pdf') || name.toLowerCase().endsWith('.pdf')
                  ? 'PDF'
                  : 'MD'
              const state = statesByRun.get(String(item.runId))
              const finalArtifactIds = Array.isArray(state?.finalArtifactIds) ? state.finalArtifactIds.map(String) : []
              const sourceCount = Array.isArray(item.sourceRefs) ? item.sourceRefs.length : 0
              return {
                id: String(item.id),
                name,
                type,
                meta: `本地保存 · 来源 ${sourceCount} 条`,
                status: finalArtifactIds.includes(String(item.id)) ? '已生成' : '草稿',
                runId: String(item.runId),
                createdAt: String(item.createdAt ?? ''),
              }
            })
          const productBuilderReceipts = (entities.receipts ?? [])
            .filter((item) => item?.id && item?.runId && isProductBuilderReceipt(item))
            .sort((left, right) => String(right.createdAt ?? '').localeCompare(String(left.createdAt ?? '')) || String(right.id).localeCompare(String(left.id)))
          let runtimeRuns: Array<Record<string, any>> = []
          try {
            const coreRunsResponse = await fetch(`${localApiBase}/api/core/runs?projectId=${encodeURIComponent(snapshot.projects[0]?.id ?? 'project-product-builder')}`)
            if (coreRunsResponse.ok) runtimeRuns = ((await coreRunsResponse.json()) as { runs?: Array<Record<string, any>> }).runs ?? []
          } catch (error) {
            console.warn('Optional runtime run readback unavailable', error)
          }
          const runtimeProductBuilderRun = runtimeRuns
            .filter((item) => String(item.request?.metadata?.provider ?? '') === 'deepseek-product-builder-draft')
            .sort((left, right) => String(right.updatedAt ?? '').localeCompare(String(left.updatedAt ?? '')))[0]
          const runtimeControlledCommandRun = runtimeRuns
            .filter((item) => String(item.request?.metadata?.provider ?? '') === 'controlled-command')
            .sort((left, right) => String(right.updatedAt ?? '').localeCompare(String(left.updatedAt ?? '')))[0]
          const latestRuntimeRun = [runtimeProductBuilderRun, runtimeControlledCommandRun]
            .filter((item): item is Record<string, any> => Boolean(item?.id))
            .sort((left, right) => String(right.updatedAt ?? '').localeCompare(String(left.updatedAt ?? '')))[0]
          const activeProductBuilderRunId = String(latestRuntimeRun?.id ?? productBuilderReceipts[0]?.runId ?? '') || undefined
          const artifacts = persistedArtifacts.length
            ? [...persistedArtifacts].sort((left, right) => {
              const leftActive = activeProductBuilderRunId && left.runId === activeProductBuilderRunId ? 1 : 0
              const rightActive = activeProductBuilderRunId && right.runId === activeProductBuilderRunId ? 1 : 0
              return rightActive - leftActive || String(right.createdAt ?? '').localeCompare(String(left.createdAt ?? '')) || right.id.localeCompare(left.id)
            }).map((item) => ({ ...item, meta: item.runId === activeProductBuilderRunId ? item.meta.replace('本地保存', '本次运行') : item.meta.replace('本地保存', '历史运行') }))
            : snapshot.artifacts
          const activeApproval = activeProductBuilderRunId
            ? (entities.approvals ?? []).filter((item) => String(item.runId) === activeProductBuilderRunId && item?.id).sort((left, right) => String(right.updatedAt ?? right.requestedAt ?? '').localeCompare(String(left.updatedAt ?? left.requestedAt ?? '')) || String(right.id).localeCompare(String(left.id)))[0]
            : approval
          const approvalState = activeApproval ? {
            id: String(activeApproval.id),
            runId: String(activeApproval.runId),
            status: String(activeApproval.status),
            ...(activeApproval.action ? { action: String(activeApproval.action) } : {}),
            ...(activeApproval.description ? { description: String(activeApproval.description) } : {}),
            ...(activeApproval.permissionTier ? { permissionTier: String(activeApproval.permissionTier) } : {}),
          } : null
          const modelReceipts = (entities.modelReceipts ?? entities.receipts ?? [])
            .map((item) => mapProviderModelReceipt(item))
            .filter((item): item is ProviderModelReceipt => Boolean(item))
            .sort((left, right) => String(right.createdAt ?? '').localeCompare(String(left.createdAt ?? '')) || right.id.localeCompare(left.id))
          const latestModelReceipt = modelReceipts.find((item) => activeProductBuilderRunId && item.runId === activeProductBuilderRunId) ?? modelReceipts[0]
          let run = snapshot.run
          if (activeProductBuilderRunId) {
            const productBuilderReceipt = productBuilderReceipts.find((item) => String(item.runId) === activeProductBuilderRunId)
            try {
              const eventResponse = await fetch(`${localApiBase}/api/runs/${encodeURIComponent(activeProductBuilderRunId)}/events?projectId=${encodeURIComponent(snapshot.projects[0]?.id ?? 'project-product-builder')}`)
              if (eventResponse.ok) {
                const eventBody = await eventResponse.json() as { events?: Array<Record<string, any>> }
                const persistedEvents = mapPersistedRunEvents(eventBody.events ?? [])
                if (persistedEvents.length) {
                  const receiptBody = productBuilderReceipt?.receipt ?? {}
                  const modelReceipt = modelReceipts.find((item) => item.runId === activeProductBuilderRunId)
                  const releaseState = statesByRun.get(activeProductBuilderRunId)
                  const waiting = approvalState?.status === 'pending' || Array.isArray(releaseState?.releaseBlockers) && releaseState.releaseBlockers.includes('approval_pending')
                  const runtimeRun = runtimeProductBuilderRun?.id === activeProductBuilderRunId
                    ? runtimeProductBuilderRun
                    : runtimeControlledCommandRun?.id === activeProductBuilderRunId ? runtimeControlledCommandRun : undefined
                  const runtimeStatus = String(runtimeRun?.status ?? '')
                  const isControlledCommand = String(runtimeRun?.request?.metadata?.provider ?? '') === 'controlled-command'
                  run = {
                    ...snapshot.run,
                    id: activeProductBuilderRunId,
                    title: String(runtimeRun?.request?.objective ?? (isControlledCommand ? '受控命令运行' : 'DeepSeek Product Builder 草稿')),
                    status: runtimeStatus === 'failed' ? '失败' : runtimeStatus === 'cancelled' ? '已取消' : waiting ? '等待确认' : runtimeStatus === 'succeeded' ? '已完成' : '运行中',
                    startedAt: String(runtimeRun?.startedAt ?? runtimeRun?.createdAt ?? snapshot.run.startedAt),
                    progress: runtimeStatus === 'failed' || runtimeStatus === 'cancelled' ? 100 : waiting ? 72 : runtimeStatus === 'succeeded' ? 100 : 40,
                    events: persistedEvents,
                    receipt: {
                      id: String(productBuilderReceipt?.id ?? `${activeProductBuilderRunId}:${isControlledCommand ? 'controlled-command' : 'product-builder'}:receipt`),
                      status: String(receiptBody.status ?? runtimeStatus ?? (waiting ? 'waiting_user' : 'succeeded')),
                      eventCount: Number(receiptBody.eventCount ?? persistedEvents.length),
                      isMock: isControlledCommand ? false : Boolean(productBuilderReceipt?.provider?.isMock ?? receiptBody.isMock ?? false),
                      ...(modelReceipt ? { modelReceipt } : {}),
                    },
                  }
                }
              }
            } catch (error) {
              console.warn('Optional run event readback unavailable', error)
            }
          }
          // ToolRuntime runs are useful diagnostics, but they must not replace
          // the Product Builder run shown as the main user workflow.
          try {
            const coreRunsResponse = await fetch(`${localApiBase}/api/core/runs?projectId=${encodeURIComponent(snapshot.projects[0]?.id ?? 'project-product-builder')}`)
            if (coreRunsResponse.ok && !activeProductBuilderRunId) {
              const coreRunsBody = await coreRunsResponse.json() as { runs?: Array<Record<string, any>> }
              const toolRun = (coreRunsBody.runs ?? [])
                      .filter((item) => ['tool-fixture', 'tool-loop-fixture', 'tool-loop-local', 'tool-local', 'tool-git', 'tool-git-diff'].includes(String(item.request?.metadata?.provider ?? item.result?.provider ?? '')))
                .sort((left, right) => String(right.updatedAt ?? '').localeCompare(String(left.updatedAt ?? '')))[0]
              if (toolRun?.id) {
                  const eventResponse = await fetch(`${localApiBase}/api/runs/${encodeURIComponent(String(toolRun.id))}/events?projectId=${encodeURIComponent(snapshot.projects[0]?.id ?? 'project-product-builder')}`)
                if (eventResponse.ok) {
                  const eventBody = await eventResponse.json() as { events?: Array<Record<string, any>> }
                  const persistedEvents = mapPersistedRunEvents(eventBody.events ?? [])
                  const completed = (eventBody.events ?? []).find((item) => item.type === 'tool.completed' || item.type === 'tool.failed')
                  const receipt = completed?.data?.schemaVersion === 'tool.execution-receipt.v1' ? completed.data : completed?.data
                  if (persistedEvents.length) {
                    run = {
                      ...snapshot.run,
                      id: String(toolRun.id),
                      title: String(toolRun.request?.objective ?? '受控 ToolRuntime 运行'),
                      status: toolRun.status === 'failed' ? '失败' : toolRun.status === 'cancelled' ? '已取消' : '已完成',
                      startedAt: String(toolRun.startedAt ?? toolRun.createdAt ?? snapshot.run.startedAt),
                      progress: toolRun.status === 'succeeded' ? 100 : 72,
                      events: persistedEvents,
                      receipt: {
                        id: String(receipt?.requestId ?? `${toolRun.id}:tool`),
                        status: String(receipt?.status ?? toolRun.status),
                        eventCount: eventBody.events?.length ?? persistedEvents.length,
                        isMock: String(toolRun.request?.metadata?.provider ?? toolRun.result?.provider ?? '') === 'tool-fixture' || String(toolRun.request?.metadata?.provider ?? toolRun.result?.provider ?? '') === 'tool-loop-local',
                      },
                    }
                  }
                }
              }
            }
          } catch (error) {
            console.warn('Optional ToolRuntime run readback unavailable', error)
          }
          const runtimeActiveRun = runtimeProductBuilderRun ?? runtimeControlledCommandRun
          const runtimeProvider = runtimeActiveRun?.result?.provider ?? {}
          const activeBinding = (entities.providerBindings ?? [])
            .filter((item) => item?.enabled !== false && String(item.role ?? 'primary') === 'primary')
            .sort((left, right) => Number(left.priority ?? 0) - Number(right.priority ?? 0) || String(left.updatedAt ?? '').localeCompare(String(right.updatedAt ?? '')))[0]
          const boundConnection = activeBinding
            ? (entities.providerConnections ?? []).find((item) => String(item.id) === String(activeBinding.connectionId))
            : undefined
          const boundProvider = activeBinding && boundConnection ? {
            name: boundConnection.provider === 'fixture' ? 'Fixture（本地）' : boundConnection.provider === 'deepseek' ? 'DeepSeek API' : boundConnection.provider === 'codex' ? 'Codex 执行器' : boundConnection.label,
            model: String(activeBinding.model),
            authMode: boundConnection.authMode === 'api_key' ? 'API Key' : boundConnection.authMode === 'subscription' ? '订阅' : boundConnection.authMode === 'cli' ? 'CLI' : boundConnection.authMode,
            billingSource: boundConnection.billingSource === 'api' ? 'API 额度' : boundConnection.billingSource === 'subscription' ? '订阅额度' : boundConnection.billingSource === 'local' ? '本地' : boundConnection.billingSource,
            healthy: boundConnection.status === 'available',
            latency: boundConnection.status === 'available' ? '已配置' : '等待验证',
          } : undefined
          const provider = latestModelReceipt ? {
            ...snapshot.provider,
            name: latestModelReceipt.provider.provider,
            model: latestModelReceipt.provider.model,
            authMode: latestModelReceipt.provider.authMode,
            billingSource: latestModelReceipt.provider.billingSource,
            healthy: !latestModelReceipt.error,
            modelReceipt: latestModelReceipt,
          } : runtimeActiveRun ? {
            ...snapshot.provider,
            name: String(runtimeActiveRun.request?.metadata?.provider ?? '') === 'controlled-command' ? '本地受控命令' : runtimeProvider.provider === 'deepseek' || String(runtimeActiveRun.request?.metadata?.provider ?? '') === 'deepseek-product-builder-draft' ? 'DeepSeek Product Builder 草稿' : String(runtimeActiveRun.request?.metadata?.provider ?? '真实执行'),
            model: String(runtimeProvider.model ?? runtimeActiveRun.request?.metadata?.model ?? (String(runtimeActiveRun.request?.metadata?.provider ?? '') === 'controlled-command' ? 'npm profile' : 'deepseek-chat')),
            authMode: String(runtimeProvider.authMode ?? 'api_key'),
            billingSource: String(runtimeProvider.billingSource ?? (String(runtimeActiveRun.request?.metadata?.provider ?? '') === 'controlled-command' ? '本地' : 'api')),
            healthy: runtimeActiveRun.status !== 'failed',
          } : boundProvider ?? snapshot.provider
          const builderState = statesByRun.get(activeProductBuilderRunId ?? String(run.id))
            ?? productBuilderReceipts.map((receipt) => statesByRun.get(String(receipt.runId))).find(Boolean)
          return {
            ...snapshot,
            source: 'local',
            projects,
            run,
            artifacts,
            approval: approvalState,
            provider,
            productBuilder: mapProductBuilderProjection(builderState) ?? snapshot.productBuilder,
            providerConnections: entities.providerConnections ?? [],
            providerBindings: entities.providerBindings ?? [],
            sessions: entities.sessions ?? [],
          }
        }
      } catch (error) {
        console.warn('Optional persistence readback unavailable', error)
        return { ...snapshot, source: 'local', approval: null }
      }
      return { ...snapshot, source: 'local' }
    } catch {
      return fixtureApi.getSnapshot()
    }
  },
  async createProject(input) {
    const response = await fetch(`${localApiBase}/api/persistence/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })
    const result = await response.json() as Project & { error?: string }
    if (!response.ok) throw new Error(result.error ?? 'project_create_failed')
    return { ...result, description: result.description ?? '', botCount: result.botCount ?? 0 }
  },
  async getLatestExecution(projectId = 'project-product-builder') {
    try {
      const entityResponse = await fetch(`${localApiBase}/api/persistence/entities?projectId=${encodeURIComponent(projectId)}`)
      if (entityResponse.ok) {
        const entities = await entityResponse.json() as {
          receipts?: Array<Record<string, any>>
          modelReceipts?: Array<Record<string, any>>
          productBuilderStates?: Array<Record<string, any>>
        }
        const allReceipts = entities.receipts ?? []
        const modelReceipts = (entities.modelReceipts ?? allReceipts)
          .map((item) => mapProviderModelReceipt(item))
          .filter((item): item is ProviderModelReceipt => Boolean(item))
          .sort((left, right) => String(right.createdAt ?? '').localeCompare(String(left.createdAt ?? '')) || right.id.localeCompare(left.id))
        const productBuilderReceipt = allReceipts
          .filter((item) => item?.id && item?.runId && isProductBuilderReceipt(item))
          .sort((left, right) => String(right.createdAt ?? '').localeCompare(String(left.createdAt ?? '')) || String(right.id).localeCompare(String(left.id)))[0]
        const receipt = productBuilderReceipt ?? allReceipts
          .filter((item) => item?.receipt?.schemaVersion !== 'provider.model-response.v1')
          .filter((item) => item?.id && item?.runId)
          .sort((left, right) => String(right.createdAt ?? '').localeCompare(String(left.createdAt ?? '')) || String(right.id).localeCompare(String(left.id)))[0]
        const latestModelReceipt = modelReceipts[0]
        if (receipt || latestModelReceipt) {
      const provider = receipt?.provider ?? latestModelReceipt?.provider ?? {}
          const receiptBody = receipt?.receipt ?? {}
          const runId = String(receipt?.runId ?? latestModelReceipt?.runId)
          const alignedModelReceipt = modelReceipts.find((item) => item.runId === runId) ?? latestModelReceipt
          const state = (entities.productBuilderStates ?? []).find((item) => String(item.runId) === runId)
          const waitingForApproval = Array.isArray(state?.releaseBlockers) && state.releaseBlockers.includes('approval_pending')
          const status = receiptBody.status === 'failed' ? 'failed' : waitingForApproval ? 'waiting_user' : receiptBody.status ?? 'succeeded'
          let eventCount = Number(receiptBody.eventCount ?? 0)
          if (!eventCount) {
            const eventResponse = await fetch(`${localApiBase}/api/runs/${encodeURIComponent(runId)}/events?projectId=${encodeURIComponent(projectId)}`)
            if (eventResponse.ok) {
              const eventBody = await eventResponse.json() as { events?: Array<unknown> }
              eventCount = Array.isArray(eventBody.events) ? eventBody.events.length : 0
            }
          }
          return {
            ok: status !== 'failed',
            provider: provider.harness === 'codex-cli' ? 'codex' : String(provider.provider ?? '') === 'deepseek' ? 'deepseek-product-builder-draft' : 'fixture',
            isMock: provider.isMock === true || receiptBody.isMock === true,
            runId,
            status: String(status),
            eventCount,
            receiptId: receipt?.id ? String(receipt.id) : alignedModelReceipt?.id,
            output: typeof receiptBody.output === 'string' ? receiptBody.output : undefined,
            error: typeof receiptBody.error === 'string' ? receiptBody.error : undefined,
            modelReceipt: alignedModelReceipt,
          }
        }
      }
      const listResponse = await fetch(`${localApiBase}/api/core/runs?projectId=${encodeURIComponent(projectId)}`)
      if (!listResponse.ok) return null
      const list = await listResponse.json() as { runs?: Array<Record<string, any>> }
      const candidate = (list.runs ?? [])
        .filter((run) => ['queued', 'running', 'waiting_user', 'succeeded', 'failed', 'cancelled'].includes(String(run.status)))
        .sort((left, right) => String(right.updatedAt ?? '').localeCompare(String(left.updatedAt ?? '')))[0]
      if (!candidate?.id) return null
      const detailResponse = await fetch(`${localApiBase}/api/core/runs/${encodeURIComponent(String(candidate.id))}?projectId=${encodeURIComponent(projectId)}`)
      if (!detailResponse.ok) return null
      const detail = await detailResponse.json() as { run?: Record<string, any>; events?: Array<Record<string, any>>; receipts?: Array<Record<string, any>>; modelReceipt?: Record<string, any> | null; modelReceipts?: Array<Record<string, any>> }
      const run = detail.run ?? candidate
      const provider = run.result?.provider ?? {}
      const executionProvider = String(run.request?.metadata?.provider ?? run.result?.provider ?? '')
      const providerEvents = (detail.events ?? []).filter((event) => event.type === 'provider.event')
      const output = providerEvents
        .map((event) => event.data?.stream ?? event.stream ?? event.data ?? event)
        .filter((stream) => stream?.type === 'item.completed' && stream?.item?.type === 'agent_message')
        .map((stream) => String(stream.item.text ?? ''))
        .filter(Boolean)
        .join('\n')
      const receipt = (detail.receipts ?? [])[0]
      const modelReceipt = mapProviderModelReceipt(detail.modelReceipt ?? detail.modelReceipts?.at(-1))
      return {
        ok: run.status !== 'failed',
        provider: providerChoiceFromRuntime(run),
        isMock: provider.isMock === true || executionProvider === 'tool-fixture' || executionProvider === 'tool-loop-local',
        runId: String(run.id),
        status: String(run.status),
        eventCount: Number(run.result?.eventCount ?? providerEvents.length),
        receiptId: provider.receiptId ?? receipt?.id,
        output: output || (executionProvider === 'controlled-command' && run.result?.output ? JSON.stringify(run.result.output, null, 2) : undefined),
        error: run.error?.message,
        modelReceipt,
      }
    } catch {
      return null
    }
  },
  async probeCodex() {
    try {
      const response = await fetch(`${localApiBase}/api/provider/codex-diagnostics`)
      const result = await response.json() as CodexProbe
      if (response.ok) return result
      const fallback = await fetch(`${localApiBase}/api/provider/codex-probe`)
      const fallbackResult = await fallback.json() as CodexProbe
      return fallback.ok ? fallbackResult : { status: 'error', reason: result.reason ?? `探针失败（HTTP ${response.status}）`, detail: result.detail }
    } catch (error) {
      return { status: 'unavailable', reason: error instanceof Error ? error.message : '无法连接本地服务' }
    }
  },
  async probeProviderConnection(id) {
    try {
      const response = await fetch(`${localApiBase}/api/persistence/provider-connections/${encodeURIComponent(id)}/probe`, { method: 'POST' })
      const result = await response.json() as { ok?: boolean; connection?: ProviderConnectionRecord; result?: Record<string, any>; error?: string }
      return { ok: Boolean(result.ok), ...(result.connection ? { connection: result.connection } : {}), ...(result.result ? { result: result.result } : {}), ...(result.error ? { error: result.error } : {}) }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : '无法连接本地服务' }
    }
  },
  async approveRun(runId, approvalId, decision = 'approved') {
    try {
      const endpoint = approvalId
        ? `${localApiBase}/api/runs/${encodeURIComponent(runId)}/approvals/${encodeURIComponent(approvalId)}/resolve`
        : `${localApiBase}/api/runs/${encodeURIComponent(runId)}/approve`
      const response = await fetch(endpoint, {
        method: 'POST',
        ...(approvalId ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision }) } : {}),
      })
      const body = await response.json().catch(() => ({})) as Record<string, unknown>
      return { ok: response.ok, ...(response.ok ? {} : { error: String(body.error ?? `审批失败（HTTP ${response.status}）`) }) }
    } catch {
      return fixtureApi.approveRun(runId, approvalId, decision)
    }
  },
  async resolveClarification(runId, clarificationId, value) {
    try {
      const response = await fetch(`${localApiBase}/api/runs/${encodeURIComponent(runId)}/clarifications/resolve`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clarificationId, value }),
      })
      const result = await response.json() as Record<string, any>
      return { ok: response.ok, ...(result.error ? { error: String(result.error) } : {}) }
    } catch {
      return fixtureApi.resolveClarification(runId, clarificationId, value)
    }
  },
  async retryRun(runId) {
    try {
      const response = await fetch(`${localApiBase}/api/runs/${encodeURIComponent(runId)}/retry`, { method: 'POST' })
      const body = await response.json().catch(() => ({})) as Record<string, unknown>
      return { ok: response.ok, ...(response.ok ? {} : { error: String(body.error ?? `重试失败（HTTP ${response.status}）`) }) }
    } catch {
      return fixtureApi.retryRun(runId)
    }
  },
  async cancelRun(runId) {
    try {
      const response = await fetch(`${localApiBase}/api/runs/${encodeURIComponent(runId)}/cancel`, { method: 'POST' })
      const result = await response.json().catch(() => ({})) as Record<string, any>
      return { ok: response.ok, ...(response.ok ? {} : { error: String(result.error ?? `取消失败（HTTP ${response.status}）`) }) }
    } catch {
      return fixtureApi.cancelRun(runId)
    }
  },
  async replayRun(runId, projectId = 'project-product-builder') {
    try {
      const response = await fetch(`${localApiBase}/api/commands/runs/${encodeURIComponent(runId)}/replay?projectId=${encodeURIComponent(projectId)}`, { method: 'POST' })
      const result = await response.json().catch(() => ({})) as Record<string, any>
      return { ok: response.ok, ...(response.ok ? {} : { error: String(result.error ?? `回放失败（HTTP ${response.status}）`) }) }
    } catch {
      return fixtureApi.replayRun(runId, projectId)
    }
  },
  async startRun(request) {
    const fixtureRunId = request.provider === 'fixture'
      ? `run-fixture-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      : undefined
    const endpoint = request.provider === 'controlled-command' ? '/api/commands/runs' : request.provider === 'codex' ? '/api/provider/codex-run' : request.provider === 'deepseek-product-builder-draft' ? '/api/product-builder/provider-draft' : ['bound', 'deepseek-tool-loop', 'tool-fixture', 'tool-loop-fixture', 'tool-loop-local', 'tool-local', 'tool-git', 'tool-git-diff'].includes(request.provider) ? '/api/runs' : '/api/product-builder/preview'
    const payload = request.provider === 'codex'
      ? { projectId: request.projectId, objective: request.objective, input: { idea: request.objective } }
      : request.provider === 'controlled-command'
        ? { projectId: request.projectId ?? 'project-product-builder', commandId: request.commandId ?? 'project.test', objective: request.objective, idempotencyKey: `web:${request.projectId ?? 'project-product-builder'}:${request.commandId ?? 'project.test'}:${request.objective}` }
      : request.provider === 'deepseek-product-builder-draft'
        ? { projectId: request.projectId, idea: request.objective, user: 'AI 产品构建者', constraints: ['保持本地优先', '不自动发布'] }
      : request.provider === 'bound'
        ? { projectId: request.projectId, provider: 'bound', goal: request.objective, input: { idea: request.objective } }
      : request.provider === 'deepseek-tool-loop'
        ? { projectId: request.projectId, provider: 'deepseek-tool-loop', goal: request.objective, path: 'fixtures/demo-project.json' }
      : request.provider === 'tool-loop-fixture'
        ? { projectId: request.projectId, provider: 'tool-loop-fixture', goal: request.objective, scenario: 'normal', path: 'fixtures/demo-project.json' }
      : request.provider === 'tool-loop-local'
        ? { projectId: request.projectId, provider: 'tool-loop-local', goal: request.objective, path: 'fixtures/demo-project.json' }
      : request.provider === 'tool-fixture'
        ? { projectId: request.projectId, provider: 'tool-fixture', goal: request.objective, path: 'fixtures/demo-project.json' }
      : request.provider === 'tool-local'
        ? { projectId: request.projectId, provider: 'tool-local', goal: request.objective, path: 'fixtures/demo-project.json' }
      : request.provider === 'tool-git-diff'
          ? { projectId: request.projectId, provider: 'tool-git-diff', goal: request.objective }
        : request.provider === 'tool-git'
          ? { projectId: request.projectId, provider: 'tool-git', goal: request.objective }
        : { projectId: request.projectId, idea: request.objective, ...(fixtureRunId ? { runId: fixtureRunId } : {}) }
    try {
      const response = await fetch(`${localApiBase}${endpoint}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await response.json() as Record<string, any>
      if (!response.ok) return { ok: false, provider: request.provider, isMock: request.provider === 'fixture', error: result.error ?? `运行失败（HTTP ${response.status}）` }
      const providerEvents = Array.isArray(result.providerEvents) ? result.providerEvents : []
      const output = providerEvents
        .map((event: any) => event?.data?.stream ?? event?.stream ?? event?.data ?? event)
        .filter((stream: any) => stream?.type === 'item.completed' && stream?.item?.type === 'agent_message')
        .map((stream: any) => String(stream.item.text ?? ''))
        .filter(Boolean)
        .join('\n')
      const runId = result.runId ?? result.run?.id ?? result.approval?.runId ?? result.continuity?.latestSnapshotId ?? undefined
      const providerReceipt = ['deepseek-product-builder-draft', 'bound'].includes(request.provider) && runId
        ? mapProviderModelReceipt({ id: `${runId}:deepseek-product-builder-draft:model:1`, runId, receipt: result.providerReceipt })
        : undefined
      return {
        ok: true,
        provider: request.provider,
        isMock: request.provider === 'fixture' || request.provider === 'tool-fixture' || request.provider === 'tool-loop-fixture' || request.provider === 'tool-loop-local' || (request.provider === 'bound' && result.isMock === true),
        runId,
        status: result.promotion?.status === 'pending_user_approval' ? 'waiting_user' : result.run?.status ?? result.status ?? 'succeeded',
        eventCount: providerEvents.length || (Array.isArray(result.events) ? result.events.length : (Array.isArray(result.handoffs) ? result.handoffs.length : 0) + (result.approval ? 1 : 0)),
        artifactCount: Array.isArray(result.artifacts) ? result.artifacts.length : result.artifact ? 1 : undefined,
        receiptId: result.receiptId ?? result.provider?.receiptId ?? result.receipt?.id ?? (providerReceipt ? providerReceipt.id : undefined),
        output: output || (request.provider === 'controlled-command' && result.controlledCommand?.output
          ? JSON.stringify(result.controlledCommand.output, null, 2)
          : request.provider === 'bound' && result.draft
            ? JSON.stringify(result.draft, null, 2)
            : request.provider === 'deepseek-product-builder-draft' && result.draft
              ? JSON.stringify(result.draft, null, 2)
              : ['deepseek-tool-loop', 'tool-fixture', 'tool-loop-local', 'tool-local', 'tool-git', 'tool-git-diff'].includes(request.provider) && result.output
                ? JSON.stringify(result.output, null, 2)
                : undefined),
        ...(request.provider === 'controlled-command' && result.approval ? { approval: { id: String(result.approval.id), runId: String(result.approval.runId), status: String(result.approval.status), action: String(result.approval.action), description: String(result.approval.description), permissionTier: String(result.approval.permissionTier) } } : {}),
        ...(request.provider === 'controlled-command' && result.profile ? { command: { id: String(result.profile.id), label: String(result.profile.label), argv: Array.isArray(result.profile.argv) ? result.profile.argv.map(String) : [], declaredEffects: Array.isArray(result.profile.declaredEffects) ? result.profile.declaredEffects.map(String) : [], approvalRequired: Boolean(result.profile.approvalRequired) } } : {}),
        ...(providerReceipt ? { modelReceipt: providerReceipt } : {}),
      }
    } catch (error) {
      return { ok: false, provider: request.provider, isMock: request.provider === 'fixture', error: error instanceof Error ? error.message : '无法连接本地服务' }
    }
  },
  async startImprovement(input) {
    try {
      const response = await fetch(`${localApiBase}/api/improvements/run`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      })
      const result = await response.json().catch(() => ({})) as ImprovementRunResponse & { error?: string }
      if (!response.ok) return { error: String(result.error ?? `自动更新失败（HTTP ${response.status}）`) }
      return result
    } catch (error) {
      return { error: error instanceof Error ? error.message : '无法连接本地服务' }
    }
  },
  async rollbackImprovement(runId, projectId, reason) {
    try {
      const response = await fetch(`${localApiBase}/api/improvements/${encodeURIComponent(runId)}/rollback`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, reason }),
      })
      const result = await response.json().catch(() => ({})) as ImprovementRunResponse & { error?: string }
      if (!response.ok) return { error: String(result.error ?? `回滚失败（HTTP ${response.status}）`) }
      return result
    } catch (error) {
      return { error: error instanceof Error ? error.message : '无法连接本地服务' }
    }
  },
  async getArtifactDetail(id, projectId) {
    try {
      const response = await fetch(`${localApiBase}/api/persistence/artifacts/${encodeURIComponent(id)}?projectId=${encodeURIComponent(projectId)}`)
      return response.ok ? await response.json() as ArtifactDetail : fixtureApi.getArtifactDetail(id, projectId)
    } catch {
      return fixtureApi.getArtifactDetail(id, projectId)
    }
  },
  async getSourceDetail(id, projectId) {
    try {
      const response = await fetch(`${localApiBase}/api/persistence/sources/${encodeURIComponent(id)}?projectId=${encodeURIComponent(projectId)}`)
      return response.ok ? await response.json() as SourceDetail : fixtureApi.getSourceDetail(id, projectId)
    } catch {
      return fixtureApi.getSourceDetail(id, projectId)
    }
  },
  async createProviderConnection(input) {
    const response = await fetch(`${localApiBase}/api/persistence/provider-connections`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })
    const result = await response.json() as ProviderConnectionRecord & { error?: string }
    if (!response.ok) throw new Error(result.error ?? 'provider_connection_create_failed')
    return result
  },
  async createProviderBinding(input) {
    const response = await fetch(`${localApiBase}/api/persistence/provider-bindings`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })
    const result = await response.json() as ProviderBindingRecord & { error?: string }
    if (!response.ok) throw new Error(result.error ?? 'provider_binding_create_failed')
    return result
  },
  async createSession(input) {
    const response = await fetch(`${localApiBase}/api/persistence/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })
    const result = await response.json() as SessionRecord & { error?: string }
    if (!response.ok) throw new Error(result.error ?? 'session_create_failed')
    return result
  },
  async listSessionMessages(sessionId, projectId) {
    const response = await fetch(`${localApiBase}/api/persistence/sessions/${encodeURIComponent(sessionId)}/messages?projectId=${encodeURIComponent(projectId)}`)
    const result = await response.json() as SessionMessageRecord[] & { error?: string }
    if (!response.ok) throw new Error(result.error ?? 'session_messages_list_failed')
    return result
  },
  async appendSessionMessage(input) {
    const response = await fetch(`${localApiBase}/api/persistence/sessions/${encodeURIComponent(input.sessionId)}/messages?projectId=${encodeURIComponent(input.projectId)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })
    const result = await response.json() as SessionMessageRecord & { error?: string }
    if (!response.ok) throw new Error(result.error ?? 'session_message_append_failed')
    return result
  },
  async runSessionMessage(input) {
    const response = await fetch(`${localApiBase}/api/persistence/sessions/${encodeURIComponent(input.sessionId)}/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })
    const result = await response.json() as SessionRunResult & { error?: string; message?: string }
    if (!response.ok && response.status !== 202 && response.status !== 422) throw new Error(result.message ?? result.error ?? `session_run_failed_${response.status}`)
    return result
  },
  async listBots(projectId) {
    try {
      const response = await fetch(`${localApiBase}/api/persistence/bots?projectId=${encodeURIComponent(projectId)}`)
      if (!response.ok) return null
      return await response.json() as BotProfileRecord[]
    } catch {
      return null
    }
  },
  async listSkills() {
    const response = await fetch(`${localApiBase}/api/persistence/skills`)
    const result = await response.json() as SkillRecord[] & { error?: string }
    if (!response.ok) throw new Error(result.error ?? 'skill_list_failed')
    return result
  },
  async createSkill(input) {
    const response = await fetch(`${localApiBase}/api/persistence/skills`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })
    const result = await response.json() as SkillRecord & { error?: string }
    if (!response.ok) throw new Error(result.error ?? 'skill_create_failed')
    return result
  },
  async toggleSkill(id, enabled) {
    const response = await fetch(`${localApiBase}/api/persistence/skills/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled }) })
    const result = await response.json() as SkillRecord & { error?: string }
    if (!response.ok) throw new Error(result.error ?? 'skill_update_failed')
    return result
  },
  async setBotSkills(id, projectId, skillIds) {
    const response = await fetch(`${localApiBase}/api/persistence/bots/${encodeURIComponent(id)}?projectId=${encodeURIComponent(projectId)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ skillIds }) })
    const result = await response.json() as BotProfileRecord & { error?: string; correlationId?: string }
    if (!response.ok) throw new Error(`${result.error ?? 'bot_skills_update_failed'}${result.correlationId ? ` (${result.correlationId})` : ''}`)
    return result
  },
  async createBot(input) {
    const response = await fetch(`${localApiBase}/api/persistence/bots`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      ...defaultBotProfile(input),
      id: undefined,
    }) })
    const result = await response.json() as BotProfileRecord & { error?: string; correlationId?: string }
    if (!response.ok) throw new Error(`${result.error ?? 'bot_create_failed'}${result.correlationId ? ` (${result.correlationId})` : ''}`)
    return result
  },
  async duplicateBot(id, projectId) {
    const sourceResponse = await fetch(`${localApiBase}/api/persistence/bots/${encodeURIComponent(id)}?projectId=${encodeURIComponent(projectId)}`)
    const source = await sourceResponse.json() as BotProfileRecord & { error?: string; correlationId?: string }
    if (!sourceResponse.ok) throw new Error(`${source.error ?? 'bot_not_found'}${source.correlationId ? ` (${source.correlationId})` : ''}`)
    const response = await fetch(`${localApiBase}/api/persistence/bots`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      projectId: source.projectId, name: `${source.name} 副本`, description: source.description, responsibility: source.responsibility,
      inputSchema: source.inputSchema, outputSchema: source.outputSchema, skillIds: source.skillIds, toolPolicy: source.toolPolicy,
      providerPolicy: source.providerPolicy, memoryPolicy: source.memoryPolicy, approvalPolicy: source.approvalPolicy,
    }) })
    const result = await response.json() as BotProfileRecord & { error?: string; correlationId?: string }
    if (!response.ok) throw new Error(`${result.error ?? 'bot_duplicate_failed'}${result.correlationId ? ` (${result.correlationId})` : ''}`)
    return result
  },
  async disableBot(id, projectId) {
    const response = await fetch(`${localApiBase}/api/persistence/bots/${encodeURIComponent(id)}?projectId=${encodeURIComponent(projectId)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: false }) })
    const result = await response.json() as BotProfileRecord & { error?: string; correlationId?: string }
    if (!response.ok) throw new Error(`${result.error ?? 'bot_disable_failed'}${result.correlationId ? ` (${result.correlationId})` : ''}`)
    return result
  },
}
