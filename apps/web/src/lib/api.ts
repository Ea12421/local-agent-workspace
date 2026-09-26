export type RunStatus = '排队中' | '运行中' | '等待确认' | '已完成' | '失败' | '已取消'

export type Project = {
  id: string
  name: string
  description: string
  updatedAt: string
  botCount: number
  activeRun?: string
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
}

export type RunEvent = {
  id: string
  label: string
  detail: string
  time: string
  kind: 'done' | 'active' | 'waiting' | 'next'
  bot?: string
}

export type Artifact = {
  id: string
  name: string
  type: 'PDF' | 'MD' | 'JSON'
  meta: string
  status: '已生成' | '草稿'
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
  }
  artifacts: Artifact[]
  provider: {
    name: string
    model: string
    authMode: string
    billingSource: string
    healthy: boolean
    latency: string
  }
}

export const fixtureSnapshot: WorkspaceSnapshot = {
  source: 'fixture',
  projects: [
    { id: 'product-builder', name: 'AI 产品构建器', description: '从想法到可执行方案', updatedAt: '刚刚', botCount: 5, activeRun: '需求拆解与验证' },
    { id: 'content-studio', name: '内容生产工作流', description: '选题、脚本与发布复盘', updatedAt: '昨天', botCount: 3 },
    { id: 'research-lab', name: 'Research Lab', description: '可追溯的研究卡片', updatedAt: '3 天前', botCount: 2 },
  ],
  bots: [
    { id: 'manager', name: '项目总控', role: '拆解目标、调度交接', initials: '总', color: '#5c5ae8', status: '运行中', provider: 'DeepSeek V4 Pro', permission: '工作区写入', skills: ['任务规划', '交接路由'] },
    { id: 'research', name: 'Research Bot', role: '寻找事实并保留来源', initials: '研', color: '#099d82', status: '待机', provider: 'DeepSeek V4 Pro', permission: '只读', skills: ['公开搜索', '来源审计'] },
    { id: 'product', name: 'Product Bot', role: '定义用户、场景与 MVP', initials: '产', color: '#e4873c', status: '待机', provider: 'DeepSeek V4 Pro', permission: '只读', skills: ['产品定义', '冲突检查'] },
    { id: 'architecture', name: 'Architecture Bot', role: '选择可实现的技术路线', initials: '架', color: '#3478c8', status: '待机', provider: 'DeepSeek V4 Pro', permission: '只读', skills: ['架构评估', '成本估算'] },
    { id: 'evaluation', name: 'Evaluation Bot', role: '把成功标准变成可测试规则', initials: '评', color: '#ca568a', status: '待机', provider: 'DeepSeek V4 Pro', permission: '工作区写入', skills: ['质量评分', 'Bad Case'] },
  ],
  run: {
    id: 'run_20260926_1842', title: 'AI 视频生成平台 · 首轮方案', status: '等待确认', startedAt: '今天 18:42', elapsed: '02:18', progress: 72,
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
    { id: 'a1', name: 'research-report.md', type: 'MD', meta: '4 个来源 · 6.2 KB', status: '已生成' },
    { id: 'a2', name: 'product-brief.md', type: 'MD', meta: '用户场景 · MVP 范围', status: '已生成' },
    { id: 'a3', name: 'source-ledger.json', type: 'JSON', meta: '可追溯证据账本', status: '已生成' },
    { id: 'a4', name: 'execution-plan.md', type: 'MD', meta: '等待后续节点', status: '草稿' },
  ],
  provider: { name: 'DeepSeek API', model: 'deepseek-v4-pro', authMode: 'API Key', billingSource: 'API 额度', healthy: true, latency: '1.8 s' },
}

/** API boundary used by the UI. Swap this fixture implementation for the local server client. */
export interface WorkspaceApi {
  getSnapshot(): Promise<WorkspaceSnapshot>
  approveRun(runId: string): Promise<{ ok: boolean }>
  retryRun(runId: string): Promise<{ ok: boolean }>
}

export const fixtureApi: WorkspaceApi = {
  async getSnapshot() {
    await new Promise((resolve) => setTimeout(resolve, 160))
    return structuredClone(fixtureSnapshot)
  },
  async approveRun(_runId) {
    await new Promise((resolve) => setTimeout(resolve, 260))
    return { ok: true }
  },
  async retryRun(_runId) {
    await new Promise((resolve) => setTimeout(resolve, 260))
    return { ok: true }
  },
}

const localApiBase = (import.meta as any).env?.VITE_API_BASE ?? 'http://127.0.0.1:4310'

/** Prefer the local control plane; keep the fixture as an explicit offline fallback. */
export const workspaceApi: WorkspaceApi = {
  async getSnapshot() {
    try {
      const response = await fetch(`${localApiBase}/api/ui-snapshot`)
      if (!response.ok) throw new Error(`workspace API ${response.status}`)
      return { ...await response.json() as WorkspaceSnapshot, source: 'local' }
    } catch {
      return fixtureApi.getSnapshot()
    }
  },
  async approveRun(runId) {
    try {
      const response = await fetch(`${localApiBase}/api/runs/${encodeURIComponent(runId)}/approve`, { method: 'POST' })
      return { ok: response.ok }
    } catch {
      return fixtureApi.approveRun(runId)
    }
  },
  async retryRun(runId) {
    try {
      const response = await fetch(`${localApiBase}/api/runs/${encodeURIComponent(runId)}/retry`, { method: 'POST' })
      return { ok: response.ok }
    } catch {
      return fixtureApi.retryRun(runId)
    }
  },
}
