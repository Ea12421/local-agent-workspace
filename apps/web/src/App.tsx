import { useCallback, useEffect, useMemo, useState } from 'react'
import workspaceLogoUrl from './assets/local-agent-workspace-logo.png?inline'
import {
  Activity, AlertCircle, ArrowRight, Bot, Check, ChevronDown, CircleHelp, Clock3, Code2, Command, FileText,
  FolderKanban, History, LayoutDashboard, Menu, MoreHorizontal, Play, Plus, RefreshCcw, Search,
  Settings2, ShieldCheck, Sparkles, Terminal, UserRound, X,
} from 'lucide-react'
import { workspaceApi, type ArtifactDetail, type Bot as BotData, type BotProfileRecord, type CodexProbe, type ExecutionPlanRecord, type ImprovementRunResponse, type MemoryRecallStrategy, type OrchestratorExecutionMode, type OrchestratorProviderMetadata, type OrchestratorProviderMode, type PlanAnswerRecord, type ProductBuilderProjection, type Project, type ProviderChoice, type ProviderModelReceipt, type RunEvent, type SessionMessageRecord, type SkillRecord, type SourceDetail, type StartRunResult, type WorkspaceSnapshot } from './lib/api'

type View = 'overview' | 'bots' | 'runs' | 'artifacts'

function useEscape(onEscape: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onEscape()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enabled, onEscape])
}

function WorkspaceMark({ size = 38, label }: { size?: number; label?: string }) {
  return <img className="workspace-mark" width={size} height={size} src={workspaceLogoUrl} alt={label ?? ''} aria-hidden={label ? undefined : true} />
}

function App() {
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null)
  const [view, setView] = useState<View>('overview')
  const [projectId, setProjectId] = useState('project-product-builder')
  const [menuOpen, setMenuOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [approvalOpen, setApprovalOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [newRunOpen, setNewRunOpen] = useState(false)
  const [newRunBusy, setNewRunBusy] = useState(false)
  const [newRunObjective, setNewRunObjective] = useState('')
  const [newRunProvider, setNewRunProvider] = useState<ProviderChoice>('fixture')
  const [newRunCommandId, setNewRunCommandId] = useState<'project.test' | 'project.build_web'>('project.test')
  const [latestExecution, setLatestExecution] = useState<StartRunResult | null>(null)
  const [codexProbe, setCodexProbe] = useState<CodexProbe | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [helpOpen, setHelpOpen] = useState(false)

  const loadSnapshot = useCallback(async (requestedProjectId?: string) => {
    try {
      const nextSnapshot = await workspaceApi.getSnapshot(requestedProjectId ?? projectId)
      setSnapshot(nextSnapshot)
      setApprovalOpen(nextSnapshot.approval?.status === 'pending')
      setLoadError('')
    } catch (error) {
      const message = error instanceof Error ? error.message : '无法读取本地工作区'
      setLoadError(message)
      throw error
    }
  }, [projectId])
  useEffect(() => {
    void loadSnapshot(projectId).catch(() => undefined)
    workspaceApi.getLatestExecution(projectId).then(setLatestExecution).catch((error) => setToast(`最近运行读取失败：${error instanceof Error ? error.message : '未知错误'}`))
    workspaceApi.probeCodex().then(setCodexProbe).catch((error) => setToast(`Codex 探针读取失败：${error instanceof Error ? error.message : '未知错误'}`))
  }, [loadSnapshot, projectId])
  useEffect(() => {
    if (!menuOpen && !newRunOpen && !helpOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (helpOpen) setHelpOpen(false)
      else if (newRunOpen) setNewRunOpen(false)
      else setMenuOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [helpOpen, menuOpen, newRunOpen])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 3200)
    return () => window.clearTimeout(timer)
  }, [toast])

  const project = snapshot?.projects.find((item) => item.id === projectId) ?? snapshot?.projects[0]
  const navigate = (nextView: View) => {
    setView(nextView)
    setMenuOpen(false)
  }
  const handleAction = async (action: 'approve' | 'retry') => {
    if (!snapshot || busy) return
    setBusy(true)
    try {
      const result = action === 'approve'
        ? await workspaceApi.approveRun(snapshot.approval?.runId ?? snapshot.run.id, snapshot.approval?.id, 'approved')
        : snapshot.approval?.action === 'command.run'
          ? await workspaceApi.approveRun(snapshot.approval.runId, snapshot.approval.id, 'rejected')
        : await workspaceApi.retryRun(snapshot.run.id)
      if (result.ok) {
        await loadSnapshot()
        setToast(action === 'approve' ? '已确认，Architecture Bot 将继续工作' : '已重新加入运行队列')
      } else {
        setToast(`${action === 'approve' ? '确认' : '重试'}失败：${result.error ?? '本地服务未接受请求'}`)
      }
    } catch (error) {
      setToast(`${action === 'approve' ? '确认' : '重试'}失败：${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setBusy(false)
    }
  }

  const handleResolveClarification = async (clarificationId: string, value: string) => {
    if (!snapshot || busy) return
    setBusy(true)
    try {
      const result = await workspaceApi.resolveClarification(snapshot.productBuilder?.runId ?? snapshot.run.id, clarificationId, value)
      if (result.ok) {
        await loadSnapshot()
        setToast('澄清项已保存，计划状态已更新')
      } else setToast(`澄清项保存失败：${result.error ?? '未知错误'}`)
    } catch (error) {
      setToast(`澄清项保存失败：${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setBusy(false)
    }
  }

  const handleStartRun = async () => {
    const objective = newRunObjective.trim()
    if (!objective || newRunBusy) return
    setNewRunBusy(true)
    try {
      const result = await workspaceApi.startRun({ projectId, provider: newRunProvider, objective, ...(newRunProvider === 'controlled-command' ? { commandId: newRunCommandId } : {}) })
      setLatestExecution(result)
      if (result.ok) {
        setNewRunOpen(false)
        await loadSnapshot()
        const providerLabel = newRunProvider === 'bound' ? '项目绑定 Provider' : newRunProvider === 'controlled-command' ? '受控命令' : newRunProvider === 'codex' ? 'Codex 订阅' : newRunProvider === 'deepseek-product-builder-draft' ? 'DeepSeek Product Builder 草稿' : newRunProvider === 'deepseek-tool-loop' ? 'DeepSeek 只读 Tool Loop' : newRunProvider === 'tool-git-diff' ? '只读 Git 变更摘要' : newRunProvider === 'tool-git' ? '只读 Git 状态' : newRunProvider === 'tool-loop-local' ? '本地只读 Tool Loop' : newRunProvider === 'tool-local' ? '只读项目文件' : newRunProvider === 'tool-loop-fixture' ? 'Fixture Tool Loop' : newRunProvider === 'tool-fixture' ? '只读边界检查' : '本地演示'
        setToast(result.status === 'waiting_user' ? `${providerLabel}已生成，等待人工审阅` : `${providerLabel}运行已完成，可查看执行回执`)
      } else {
        setToast(`运行失败：${result.error ?? '未知错误'}`)
      }
    } catch (error) {
      setToast(`运行失败：${error instanceof Error ? error.message : '无法连接本地服务'}`)
    } finally {
      setNewRunBusy(false)
    }
  }

  const openNewRun = () => {
    const primaryBinding = snapshot?.providerBindings?.find((item) => item.role === 'primary' && item.enabled)
    const primaryConnection = primaryBinding ? snapshot?.providerConnections?.find((item) => item.id === primaryBinding.connectionId) : undefined
    setNewRunProvider(primaryConnection?.provider === 'codex' ? 'bound' : 'fixture')
    setNewRunOpen(true)
  }

  const handleRefresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await Promise.all([loadSnapshot(), workspaceApi.getLatestExecution(projectId).then(setLatestExecution)])
      setToast('已刷新本地运行状态')
    } catch (error) {
      setToast(`刷新失败：${error instanceof Error ? error.message : '无法读取本地状态'}`)
    } finally {
      setRefreshing(false)
    }
  }

  if (!snapshot || !project) return loadError
    ? <div className="boot-screen"><WorkspaceMark label="Agent Workspace" /><strong>本地工作区暂时无法载入</strong><p>{loadError}</p><button className="primary-button" onClick={() => void loadSnapshot().catch(() => undefined)}>重试</button></div>
    : <div className="boot-screen"><WorkspaceMark label="Agent Workspace" /><span>正在载入本地工作区…</span></div>

  return (
    <div className="app-shell">
      <Sidebar view={view} setView={navigate} projects={snapshot.projects} selected={projectId} onProjectChange={setProjectId} onProjectCreated={(created) => { setProjectId(created.id); void loadSnapshot(created.id).catch(() => undefined); setToast(`已创建项目：${created.name}`) }} onToast={setToast} open={menuOpen} onClose={() => setMenuOpen(false)} />
      {menuOpen && <button className="mobile-backdrop" aria-label="关闭导航" onClick={() => setMenuOpen(false)} />}
      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu" aria-label="打开导航" aria-expanded={menuOpen} onClick={() => setMenuOpen((current) => !current)}><Menu size={18} /></button>
          <div className="breadcrumbs"><span>项目</span><ChevronDown size={14} /><strong>{project.name}</strong></div>
          <div className="topbar-actions">
            <div className="connection"><span className={`pulse-dot ${snapshot.source === 'fixture' ? 'fixture-dot' : ''}`} /> {snapshot.source === 'fixture' ? '本地演示模式' : '本地服务正常'}</div>
            <button className="icon-button" aria-label="帮助" onClick={() => setHelpOpen(true)}><CircleHelp size={17} /></button>
            <div className="avatar">黄</div>
          </div>
        </header>
        <div className="content">
          <PageHeader view={view} project={project} onNewRun={openNewRun} />
          {view === 'overview' && <Overview snapshot={snapshot} project={project} approvalOpen={approvalOpen} busy={busy} onAction={handleAction} onResolveClarification={handleResolveClarification} onNavigate={navigate} latestExecution={latestExecution} onToast={setToast} onRefresh={() => void loadSnapshot()} />}
          {view === 'bots' && <BotsView bots={snapshot.bots} projectId={project.id} onToast={setToast} />}
          {view === 'runs' && <RunsView snapshot={snapshot} onAction={handleAction} busy={busy} refreshing={refreshing} onRefresh={handleRefresh} />}
          {view === 'artifacts' && <ArtifactsView artifacts={snapshot.artifacts} projectId={project.id} />}
        </div>
      </main>
      {newRunOpen && <NewRunDialog provider={newRunProvider} commandId={newRunCommandId} objective={newRunObjective} busy={newRunBusy} codexProbe={codexProbe} onProviderChange={setNewRunProvider} onCommandChange={setNewRunCommandId} onObjectiveChange={setNewRunObjective} onClose={() => !newRunBusy && setNewRunOpen(false)} onSubmit={handleStartRun} />}
      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}
      {toast && <div className="toast" role="status" aria-live="polite"><Check size={16} />{toast}<button onClick={() => setToast('')}><X size={14} /></button></div>}
    </div>
  )
}

function Sidebar({ view, setView, projects, selected, onProjectChange, onProjectCreated, onToast, open, onClose }: { view: View; setView: (view: View) => void; projects: WorkspaceSnapshot['projects']; selected: string; onProjectChange: (id: string) => void; onProjectCreated: (project: Project) => void; onToast: (message: string) => void; open: boolean; onClose: () => void }) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('我的新项目')
  const [description, setDescription] = useState('')
  const [workspacePath, setWorkspacePath] = useState('')
  useEscape(() => { if (!busy) setDialogOpen(false) }, dialogOpen)
  const items: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'overview', label: '工作台概览', icon: LayoutDashboard }, { id: 'bots', label: 'Bots', icon: Bot }, { id: 'runs', label: '运行记录', icon: Activity }, { id: 'artifacts', label: '项目产物', icon: FileText },
  ]
  const createProject = async () => {
    if (busy || !name.trim() || !workspacePath.trim()) return
    setBusy(true)
    try {
      const created = await workspaceApi.createProject({ name: name.trim(), description: description.trim(), workspacePath: workspacePath.trim() })
      onProjectCreated(created)
      setDialogOpen(false)
      setName('我的新项目')
      setDescription('')
      setWorkspacePath('')
    } catch (error) {
      onToast(`项目创建失败：${error instanceof Error ? error.message : '未知错误'}`)
    } finally { setBusy(false) }
  }
  return <aside className={`sidebar ${open ? 'open' : ''}`}>
    <div className="logo-row"><WorkspaceMark size={40} label="Agent Workspace" /><div><div className="logo-name">Agent Workspace</div><div className="logo-caption">本地项目工作台</div></div></div>
    <button className="new-project" onClick={() => setDialogOpen(true)} disabled={busy}><Plus size={16} /> 新建项目</button>
    <nav className="nav-list">{items.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${view === id ? 'active' : ''}`} onClick={() => { setView(id); onClose() }}><Icon size={17} /><span>{label}</span></button>)}</nav>
    <div className="sidebar-section"><div className="section-label">我的项目 <button aria-label="更多项目"><MoreHorizontal size={14} /></button></div>{projects.map((item) => <button key={item.id} className={`project-item ${selected === item.id ? 'selected' : ''}`} onClick={() => { onProjectChange(item.id); onClose() }}><span className="project-icon"><FolderKanban size={14} /></span><span className="project-copy"><strong>{item.name}</strong><small>{item.activeRun ?? item.description}</small></span></button>)}</div>
    <div className="sidebar-bottom"><div className="workspace-status"><Settings2 size={16} /><span>项目设置在概览页管理</span></div><div className="privacy-note"><ShieldCheck size={15} /><span>数据保存在本机<br /><small>隐私模式已开启</small></span></div></div>
    {dialogOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setDialogOpen(false) }}><section className="run-dialog" role="dialog" aria-modal="true" aria-labelledby="create-project-title"><div className="dialog-heading"><div><span className="card-kicker"><FolderKanban size={13} /> 项目管理</span><h2 id="create-project-title">新建项目</h2></div><button className="icon-button" aria-label="关闭新建项目" onClick={() => !busy && setDialogOpen(false)} disabled={busy}><X size={17} /></button></div><label className="form-field"><span>项目名称</span><input value={name} onChange={(event) => setName(event.target.value)} disabled={busy} /></label><label className="form-field"><span>说明（可选）</span><input value={description} onChange={(event) => setDescription(event.target.value)} disabled={busy} /></label><label className="form-field"><span>本地项目目录</span><input value={workspacePath} onChange={(event) => setWorkspacePath(event.target.value)} placeholder="例如 /Users/你/Projects/my-app" disabled={busy} /><small className="form-hint">这里只登记目录边界，不会自动读取或上传目录内容。</small></label><div className="dialog-actions"><button className="secondary-button" onClick={() => setDialogOpen(false)} disabled={busy}>取消</button><button className="primary-button" onClick={() => void createProject()} disabled={busy || !name.trim() || !workspacePath.trim()}>{busy ? '保存中…' : '创建项目'}</button></div></section></div>}
  </aside>
}

function PageHeader({ view, project, onNewRun }: { view: View; project: WorkspaceSnapshot['projects'][number]; onNewRun: () => void }) {
  const titles: Record<View, [string, string]> = { overview: ['工作台概览', '继续推进你的产品想法，所有运行和证据都在这里。'], bots: ['Bots 管理', '配置职责、工具与权限，让每个 Bot 都知道自己的边界。'], runs: ['运行记录', '查看每次运行的事件、交接和恢复状态。'], artifacts: ['项目产物', '查看每次运行生成的文档与来源。'] }
  return <div className="page-header"><div><div className="eyebrow"><FolderKanban size={14} /> {project.name}</div><h1>{titles[view][0]}</h1><p>{titles[view][1]}</p></div>{view === 'overview' && <button className="primary-button" onClick={onNewRun}><Play size={15} fill="currentColor" /> 新建一次运行</button>}</div>
}

function Overview({ snapshot, project, approvalOpen, busy, onAction, onResolveClarification, onNavigate, latestExecution, onToast, onRefresh }: { snapshot: WorkspaceSnapshot; project: WorkspaceSnapshot['projects'][number]; approvalOpen: boolean; busy: boolean; onAction: (action: 'approve' | 'retry') => Promise<void>; onResolveClarification: (clarificationId: string, value: string) => Promise<void>; onNavigate: (view: View) => void; latestExecution: StartRunResult | null; onToast: (message: string) => void; onRefresh: () => void }) {
  const sessions = snapshot.sessions ?? []
  const [selectedSessionId, setSelectedSessionId] = useState(sessions[0]?.id ?? '')
  useEffect(() => {
    setSelectedSessionId((current) => sessions.some((item) => item.id === current) ? current : (sessions[0]?.id ?? ''))
  }, [sessions])
  const isFixture = /fixture/i.test(snapshot.provider.name) || snapshot.source === 'fixture'
  const providerLabel = isFixture ? '本地演示' : snapshot.provider.name
  const responseValue = isFixture ? '本地演示' : snapshot.provider.latency
  const activeRunCount = ['排队中', '运行中', '等待确认'].includes(snapshot.run.status) ? '1' : '0'
  const activeBotCount = snapshot.bots.filter((bot) => bot.status === '运行中' && bot.enabled !== false).length
  const currentArtifacts = snapshot.artifacts.filter((artifact) => !artifact.runId || artifact.runId === snapshot.run.id)
  const nextStep = approvalOpen
    ? '检查上方审批卡片，确认后工作流才会继续。'
    : snapshot.run.status === '失败'
      ? '打开运行记录查看失败原因，再选择是否重试。'
      : snapshot.run.status === '已完成'
        ? '查看本次产物和来源，或开始下一次运行。'
        : '先确认项目边界，再从“新建一次运行”开始。'
  return <>
    <div className="metric-grid"><Metric label="进行中的运行" value={activeRunCount} meta={snapshot.run.status} tone="purple" icon={Activity} /><Metric label="活跃 Bots" value={`${activeBotCount} / ${snapshot.bots.length}`} meta="当前项目" tone="green" icon={Bot} /><Metric label="当前产物" value={String(currentArtifacts.length)} meta="本次运行的输出" tone="orange" icon={FileText} /><Metric label="最近运行" value={responseValue} meta={providerLabel} tone="blue" icon={Clock3} /></div>
    <div className="next-step-note"><Sparkles size={15} /><strong>下一步</strong><span>{nextStep}</span></div>
    <ProviderSetupCard project={project} bots={snapshot.bots} connections={snapshot.providerConnections ?? []} bindings={snapshot.providerBindings ?? []} onToast={onToast} onRefresh={onRefresh} />
    <SessionCard project={project} bots={snapshot.bots} sessions={sessions} selectedId={selectedSessionId} onSelect={setSelectedSessionId} providerConnections={snapshot.providerConnections ?? []} providerBindings={snapshot.providerBindings ?? []} onToast={onToast} onRefresh={onRefresh} />
    <OrchestratorCard project={project} sessions={sessions} selectedSessionId={selectedSessionId} plans={snapshot.plans ?? []} planAnswers={snapshot.planAnswers ?? []} onToast={onToast} onRefresh={onRefresh} />
    <ProjectBindingCard project={project} />
    <BuilderContractCard productBuilder={snapshot.productBuilder} busy={busy} onResolve={onResolveClarification} />
    <ImprovementCard projectId={project.id} onToast={onToast} />
    {latestExecution && <ExecutionReceiptCard execution={latestExecution} />}
    <div className="workspace-grid"><section className="card run-card"><div className="card-heading"><div><RunKicker status={snapshot.run.status} /><h2>{snapshot.run.title}</h2></div><StatusPill status={snapshot.run.status} /></div><div className="run-meta"><span><Clock3 size={14} /> 已运行 {snapshot.run.elapsed}</span><button onClick={() => onNavigate('runs')}>查看完整记录 <ArrowRight size={14} /></button></div><details className="technical-details"><summary>技术详情</summary><code>Run：{snapshot.run.id}</code></details><div className="progress-row"><span>整体进度</span><strong>{snapshot.run.progress}%</strong></div><div className="progress"><span style={{ width: `${snapshot.run.progress}%` }} /></div><Timeline events={snapshot.run.events} /></section><section className="right-column">{approvalOpen && <ApprovalCard approval={snapshot.approval} busy={busy} onAction={onAction} />}<ProviderCard provider={snapshot.provider} modelReceipt={snapshot.run.receipt?.modelReceipt ?? snapshot.provider.modelReceipt} /></section></div>
    <div className="lower-grid"><section className="card"><div className="card-heading compact"><div><span className="card-kicker">项目 Bots</span><h2>正在协作的角色</h2></div><button className="text-button" onClick={() => onNavigate('bots')}>管理 Bots <ArrowRight size={14} /></button></div><BotStack bots={snapshot.bots} /></section><section className="card"><div className="card-heading compact"><div><span className="card-kicker">最近产物</span><h2>可追溯的输出</h2></div><button className="text-button" onClick={() => onNavigate('artifacts')}>查看全部 <ArrowRight size={14} /></button></div><ArtifactList artifacts={currentArtifacts.slice(0, 3)} /></section></div>
  </>
}

function SessionCard({ project, bots, sessions, selectedId, onSelect, providerConnections, providerBindings, onToast, onRefresh }: { project: WorkspaceSnapshot['projects'][number]; bots: BotData[]; sessions: NonNullable<WorkspaceSnapshot['sessions']>; selectedId: string; onSelect: (id: string) => void; providerConnections: NonNullable<WorkspaceSnapshot['providerConnections']>; providerBindings: NonNullable<WorkspaceSnapshot['providerBindings']>; onToast: (message: string) => void; onRefresh: () => void }) {
  const [title, setTitle] = useState('新的 Product Builder 会话')
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<SessionMessageRecord[]>([])
  const [busy, setBusy] = useState(false)
  const selected = sessions.find((item) => item.id === selectedId)
  const primaryBinding = providerBindings.find((item) => item.role === 'primary' && item.enabled)
  const primaryConnection = primaryBinding ? providerConnections.find((item) => item.id === primaryBinding.connectionId) : undefined
  const sessionProvider = primaryConnection?.provider === 'codex' ? 'bound' as const : 'fixture' as const
  const sessionProviderNote = primaryConnection?.provider === 'codex'
    ? '当前会话会使用项目绑定的 Codex 执行桥。'
    : primaryConnection?.provider === 'deepseek'
      ? '当前绑定的是 DeepSeek；它用于 Product Builder 草稿，通用会话暂时使用本地演示。'
      : '没有 Codex 绑定时，通用会话使用本地演示。'
  useEffect(() => {
    if (!selectedId) { setMessages([]); return }
    workspaceApi.listSessionMessages(selectedId, project.id).then(setMessages).catch((error) => onToast(`读取会话失败：${error instanceof Error ? error.message : '未知错误'}`))
  }, [project.id, selectedId, onToast])
  const create = async () => {
    if (busy || !bots[0]) return
    setBusy(true)
    try {
      const session = await workspaceApi.createSession({ projectId: project.id, botId: bots[0].id, title: title.trim() || '新的会话' })
      onSelect(session.id)
      setTitle('新的 Product Builder 会话')
      onToast('会话已保存到当前项目。')
      onRefresh()
    } catch (error) { onToast(`创建会话失败：${error instanceof Error ? error.message : '未知错误'}`) } finally { setBusy(false) }
  }
  const send = async () => {
    if (busy || !selected || !message.trim()) return
    setBusy(true)
    try {
      const content = message.trim()
      const result = await workspaceApi.runSessionMessage({ sessionId: selected.id, projectId: project.id, content, provider: sessionProvider, messageId: globalThis.crypto?.randomUUID?.() })
      setMessages(result.messages)
      setMessage('')
      onToast(result.run.status === 'succeeded' ? '消息已运行，助手结果已回写当前会话。' : result.run.status === 'failed' ? '运行失败，但失败结果已回写当前会话。' : '运行已进入等待状态，当前会话已保存。')
      onRefresh()
    } catch (error) { onToast(`保存消息失败：${error instanceof Error ? error.message : '未知错误'}`) } finally { setBusy(false) }
  }
  return <section className="card session-card"><div className="card-heading compact"><div><span className="card-kicker">项目会话</span><h2>{selected?.title ?? '还没有项目会话'}</h2></div><span className="muted">{sessions.length} 个会话</span></div><p className="card-copy">会话、消息和运行记录属于当前项目，保存在 SQLite。{sessionProviderNote}助手结果会写回当前会话。</p>{sessions.length > 0 && <div className="session-switcher">{sessions.map((item) => <button key={item.id} className={item.id === selectedId ? 'session-chip active' : 'session-chip'} onClick={() => onSelect(item.id)}>{item.title}</button>)}</div>}{!selected && <div className="session-create-row"><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="会话名称" disabled={busy} /><button className="secondary-button small" onClick={() => void create()} disabled={busy || !bots[0]}>{busy ? '保存中…' : '创建会话'}</button></div>}{selected && <><div className="session-messages">{messages.length === 0 ? <span className="muted">还没有消息。先写一句，运行一次当前项目会话。</span> : messages.map((item) => <div className={`session-message ${item.role}`} key={item.id}><span>{item.role === 'user' ? '你' : item.role}</span><p>{item.content}</p></div>)}</div><div className="session-compose"><input value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void send() }} placeholder="给当前会话输入任务" disabled={busy} /><button className="primary-button small" onClick={() => void send()} disabled={busy || !message.trim()}>{busy ? '运行中…' : '发送并运行'}</button></div></>}</section>
}

function OrchestratorCard({ project, sessions, selectedSessionId, plans, planAnswers, onToast, onRefresh }: { project: WorkspaceSnapshot['projects'][number]; sessions: NonNullable<WorkspaceSnapshot['sessions']>; selectedSessionId: string; plans: ExecutionPlanRecord[]; planAnswers: PlanAnswerRecord[]; onToast: (message: string) => void; onRefresh: () => void }) {
  const [objective, setObjective] = useState('检查项目结构和 Git 状态')
  const [providerMode, setProviderMode] = useState<OrchestratorProviderMode>('fixture')
  const [executionMode, setExecutionMode] = useState<OrchestratorExecutionMode>('fixture')
  const [provider, setProvider] = useState<OrchestratorProviderMetadata | null>(null)
  const [plan, setPlan] = useState<ExecutionPlanRecord | null>(null)
  const [answer, setAnswer] = useState<PlanAnswerRecord | null>(null)
  const [clarification, setClarification] = useState<{ question: string; reason: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const session = sessions.find((item) => item.id === selectedSessionId)
  useEffect(() => {
    const candidates = plans.filter((item) => String(item.sessionId ?? '') === String(selectedSessionId))
    const latest = [...candidates].sort((left, right) => String(right.updatedAt ?? right.createdAt ?? '').localeCompare(String(left.updatedAt ?? left.createdAt ?? '')))[0]
    setPlan(latest ?? null)
    setAnswer(latest ? (planAnswers.find((item) => String(item.planId) === String(latest.id)) ?? null) : null)
    setClarification(null)
  }, [plans, planAnswers, selectedSessionId])
  const planGoal = async () => {
    if (!session || busy || !objective.trim()) return
    setBusy(true)
    try {
      const result = await workspaceApi.planSessionMessage({ sessionId: session.id, projectId: project.id, content: objective.trim(), messageId: globalThis.crypto?.randomUUID?.(), providerMode })
      setProvider(result.provider ?? null)
      if (result.kind === 'clarification') {
        setPlan(null)
        setClarification({ question: result.question, reason: result.reason })
        onToast('总控需要你补充任务类型。')
      } else {
        setClarification(null)
        setPlan(result.plan)
        onToast('计划已生成，尚未执行。')
      }
    } catch (error) { onToast(`计划生成失败：${error instanceof Error ? error.message : '未知错误'}`) } finally { setBusy(false) }
  }
  const runPlan = async () => {
    if (!plan || busy) return
    setBusy(true)
    try {
      const result = await workspaceApi.runExecutionPlan({ planId: plan.id, projectId: project.id, executionMode })
      setPlan(result.plan)
      setAnswer(result.answer ?? null)
      onToast(result.plan.status === 'waiting_user' ? '计划已停在审批点。' : result.plan.status === 'succeeded' ? '计划已完成。' : '计划已更新。')
      onRefresh()
    } catch (error) { onToast(`计划执行失败：${error instanceof Error ? error.message : '未知错误'}`) } finally { setBusy(false) }
  }
  const approve = async (decision: 'approved' | 'rejected') => {
    const step = plan?.steps.find((item) => item.status === 'waiting_user')
    if (!plan || !step || busy) return
    setBusy(true)
    try {
      const result = await workspaceApi.resumeExecutionPlan({ planId: plan.id, projectId: project.id, stepId: step.id, decision, executionMode })
      setPlan(result.plan)
      setAnswer(result.answer ?? null)
      onToast(decision === 'approved' ? '已批准当前步骤，计划继续执行。' : '已拒绝当前步骤，计划已取消。')
      onRefresh()
    } catch (error) { onToast(`审批处理失败：${error instanceof Error ? error.message : '未知错误'}`) } finally { setBusy(false) }
  }
  return <section className="card orchestrator-card"><div className="card-heading compact"><div><span className="card-kicker"><Sparkles size={13} /> 有界总控</span><h2>用一句话先生成执行计划</h2></div><span className="muted">只使用项目白名单能力</span></div><p className="card-copy">总控会先理解目标，再列出步骤。只读步骤可以执行；写入、命令和其他高风险步骤会停下来逐次询问。</p>{!session ? <div className="empty-state compact-empty">先在上方“项目会话”创建一个会话，再试运行总控。</div> : <><div className="orchestrator-modes"><label>规划模型<select value={providerMode} onChange={(event) => { setProviderMode(event.target.value as OrchestratorProviderMode); setPlan(null); setAnswer(null); setClarification(null) }} disabled={busy}><option value="fixture">本地演示（不消耗额度）</option><option value="bound">项目绑定的真实 Codex</option></select></label><label>执行方式<select value={executionMode} onChange={(event) => setExecutionMode(event.target.value as OrchestratorExecutionMode)} disabled={busy}><option value="fixture">演示执行</option><option value="real">真实只读工具</option></select></label></div><div className="session-compose"><input value={objective} onChange={(event) => setObjective(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void planGoal() }} placeholder="例如：检查项目结构和 Git 状态" disabled={busy} /><button className="primary-button small" onClick={() => void planGoal()} disabled={busy || !objective.trim()}>{busy ? '处理中…' : '生成计划'}</button></div>{provider && <div className="orchestrator-provider-note">本次规划：{provider.isMock ? '本地演示' : `${provider.provider ?? '真实 Provider'} · ${provider.model ?? '已绑定模型'}`} {provider.isMock ? '（不会调用真实模型）' : '（已记录真实运行回执）'}</div>}{clarification && <div className="clarification-card"><strong>需要你补充</strong><p>{clarification.question}</p><small>{clarification.reason}</small></div>}{plan && <div className="plan-timeline"><div className="plan-summary"><strong>{plan.objective}</strong><span className={`status-pill ${plan.status === 'succeeded' ? 'success' : plan.status === 'waiting_user' ? 'waiting' : ''}`}><span />{plan.status === 'queued' ? '待执行' : plan.status === 'running' ? '执行中' : plan.status === 'waiting_user' ? '等待确认' : plan.status === 'succeeded' ? '已完成' : plan.status === 'cancelled' ? '已取消' : '失败'}</span></div>{plan.steps.map((step) => <div className="plan-step" key={step.id}><span className={`plan-step-dot ${step.status}`} /> <div><strong>{step.order}. {step.objective}</strong><small>{step.approvalRequired ? '需要逐次审批' : step.toolId ?? step.skillId ?? '受控能力'} · {step.status === 'queued' ? '待执行' : step.status === 'waiting_user' ? '等待确认' : step.status === 'succeeded' ? '已完成' : step.status === 'running' ? '执行中' : step.status}</small></div></div>)}{plan.status === 'queued' && <button className="primary-button small" onClick={() => void runPlan()} disabled={busy}>执行这个计划</button>}{plan.status === 'waiting_user' && <div className="dialog-actions"><button className="secondary-button small" onClick={() => void approve('rejected')} disabled={busy}>拒绝</button><button className="primary-button small" onClick={() => void approve('approved')} disabled={busy}>批准当前步骤</button></div>}{answer && <div className="orchestrator-answer"><div className="card-kicker">执行结果 · 已落盘</div><pre>{answer.content}</pre><small>这里是本地确定性汇总，不是模型生成；来源和未知项已写入运行事件。</small></div>}</div>}</>}</section>
}

function ProviderSetupCard({ project, bots, connections, bindings, onToast, onRefresh }: { project: WorkspaceSnapshot['projects'][number]; bots: BotData[]; connections: NonNullable<WorkspaceSnapshot['providerConnections']>; bindings: NonNullable<WorkspaceSnapshot['providerBindings']>; onToast: (message: string) => void; onRefresh: () => void }) {
  const [open, setOpen] = useState(false)
  const [provider, setProvider] = useState<'deepseek' | 'codex' | 'fixture'>('deepseek')
  const [model, setModel] = useState('deepseek-chat')
  const [label, setLabel] = useState('我的 DeepSeek')
  const [envName, setEnvName] = useState('DEEPSEEK_API_KEY')
  const [busy, setBusy] = useState(false)
  const primary = bindings.find((item) => item.role === 'primary' && item.enabled)
  const connection = primary ? connections.find((item) => item.id === primary.connectionId) : undefined
  const firstBot = bots[0]
  const submit = async () => {
    if (busy || !firstBot) return
    setBusy(true)
    try {
      const created = await workspaceApi.createProviderConnection({
        label: label.trim() || (provider === 'deepseek' ? '我的 DeepSeek' : provider === 'codex' ? '我的 Codex' : '离线 Fixture'),
        provider,
        harness: provider === 'deepseek' ? 'deepseek-api' : provider === 'codex' ? 'codex-cli' : 'fixture',
        authMode: provider === 'deepseek' ? 'api_key' : provider === 'codex' ? 'subscription' : 'local',
        billingSource: provider === 'deepseek' ? 'api' : provider === 'codex' ? 'subscription' : 'local',
        ...(provider === 'deepseek' ? { secretRef: { kind: 'env' as const, name: envName.trim() || 'DEEPSEEK_API_KEY' } } : provider === 'codex' ? { secretRef: { kind: 'cli' as const, profile: 'default' } } : {}),
        status: provider === 'fixture' ? 'available' : 'unconfigured',
      })
      await workspaceApi.createProviderBinding({ projectId: project.id, connectionId: created.id, model: model.trim() || (provider === 'deepseek' ? 'deepseek-chat' : 'codex-cli-default'), role: 'primary', priority: 0 })
      setOpen(false)
      onToast('Provider 已保存。运行时会使用项目绑定，并保留真实身份。')
      onRefresh()
    } catch (error) {
      onToast(`Provider 保存失败：${error instanceof Error ? error.message : '未知错误'}`)
    } finally { setBusy(false) }
  }
  const probe = async () => {
    if (!connection || busy) return
    setBusy(true)
    try {
      const result = await workspaceApi.probeProviderConnection(connection.id)
      onToast(result.ok ? 'Provider 探针通过，连接状态已更新' : result.result?.reason ? String(result.result.reason) : (result.error ?? 'Provider 尚未验证'))
      onRefresh()
    } finally { setBusy(false) }
  }
  return <section className="card provider-setup-card"><div className="card-heading compact"><div><span className="card-kicker">模型连接</span><h2>{connection && primary ? `${connection.label} · ${primary.model}` : '还没有项目模型连接'}</h2></div><div className="provider-card-actions"><button className="text-button" onClick={() => setOpen((value) => !value)}>{open ? '收起' : connection ? '更换连接' : '配置 Provider'} <ArrowRight size={14} /></button>{connection && <button className="text-button" onClick={() => void probe()} disabled={busy}>{busy ? '验证中…' : '验证连接'}</button>}</div></div><p className="card-copy">这里保存 Provider 元数据与环境变量引用，不保存 API Key 原文。探针只验证本机可见的连接状态，不会显示 Secret。</p>{connection && primary ? <div className="provider-status-row"><span className={`status-dot ${connection.status === 'available' ? 'ok' : 'warn'}`} /><strong>{connection.status === 'available' ? '已配置，可解析' : connection.status === 'blocked' ? '环境受限' : connection.status === 'error' ? '探针失败' : '已保存，尚未验证'}</strong><span className="muted">{connection.provider} · {connection.authMode} · {connection.billingSource}</span></div> : <div className="empty-state compact-empty">未配置时只能使用离线 Fixture 诊断；配置自己的 Provider 后，项目才会走真实模型路径。</div>}{open && <div className="provider-form"><label>Provider<select value={provider} onChange={(event) => { const next = event.target.value as typeof provider; setProvider(next); setModel(next === 'deepseek' ? 'deepseek-chat' : next === 'codex' ? 'codex-cli-default' : 'fixture-model') }}><option value="deepseek">DeepSeek API</option><option value="codex">Codex CLI / 订阅探针</option><option value="fixture">离线 Fixture</option></select></label><label>连接名称<input value={label} onChange={(event) => setLabel(event.target.value)} /></label><label>模型<input value={model} onChange={(event) => setModel(event.target.value)} /></label>{provider === 'codex' && <small>填具体模型名，或保留 codex-cli-default，使用已登录 Codex CLI 的默认模型。</small>}{provider === 'deepseek' && <label>环境变量名<input value={envName} onChange={(event) => setEnvName(event.target.value)} /><small>只填变量名；Key 由本机环境提供。</small></label>}<div className="provider-form-actions"><button className="secondary-button" onClick={() => setOpen(false)} disabled={busy}>取消</button><button className="primary-button" onClick={() => void submit()} disabled={busy || !firstBot}>{busy ? '保存中…' : '保存项目连接'}</button></div></div>}</section>
}

function ImprovementCard({ projectId, onToast }: { projectId: string; onToast: (message: string) => void }) {
  const [result, setResult] = useState<ImprovementRunResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [memoryStrategy, setMemoryStrategy] = useState<MemoryRecallStrategy>('lexical')
  const projection = result?.projection
  const evaluationBundle = result?.evaluationBundle
  const statusLabel = projection?.status === 'published'
    ? '已发布候选版本'
    : projection?.status === 'rolled_back'
      ? '已回滚到原版本'
      : projection?.status === 'waiting_user'
        ? '等待审批'
        : projection?.status === 'failed'
          ? '检查未通过'
          : projection?.status === 'running'
            ? '检查中'
            : '还没有运行'
  const run = async () => {
    if (busy) return
    setBusy(true)
    try {
      const response = await workspaceApi.startImprovement({
        projectId,
        target: 'prompt',
        reason: '根据当前项目运行记录生成一次可回滚的提示词候选',
        idempotencyKey: `web-rsi-${Date.now()}`,
        memoryStrategy,
      })
      if ('error' in response) {
        onToast(`自动更新失败：${response.error}`)
      } else {
        setResult(response)
        onToast(response.projection.status === 'published' ? '固定检查通过，候选版本已发布' : '自动更新已生成，请查看结果')
      }
    } catch (error) {
      onToast(`自动更新失败：${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setBusy(false)
    }
  }
  const rollback = async () => {
    if (!result?.runId || busy || projection?.status !== 'published') return
    setBusy(true)
    try {
      const response = await workspaceApi.rollbackImprovement(result.runId, projectId, '用户从工作台回滚自动更新候选')
      if ('error' in response) onToast(`回滚失败：${response.error}`)
      else { setResult(response); onToast('已回滚到候选更新前的版本') }
    } catch (error) {
      onToast(`回滚失败：${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setBusy(false)
    }
  }
  return <section className="card improvement-card"><div className="card-heading compact"><div><span className="card-kicker"><Sparkles size={13} /> 受控自动更新</span><h2>让系统根据运行记录提出改进</h2></div><span className={`status-pill ${projection?.status === 'published' ? 'success' : projection?.status === 'waiting_user' ? 'waiting' : ''}`}><span />{statusLabel}</span></div><p className="card-description">先做一次固定结构检查，生成可回滚的提示词候选。这个按钮不会自动扩大工具权限，也不会修改项目文件。</p><div className="improvement-strategy"><label htmlFor="memory-recall-strategy">历史记忆策略</label><select id="memory-recall-strategy" className="provider-select" value={memoryStrategy} onChange={(event) => setMemoryStrategy(event.target.value as MemoryRecallStrategy)} disabled={busy}><option value="lexical">关键词模式（默认）</option><option value="hybrid">混合模式（关键词 + 短语 + 新鲜度）</option></select><small>只影响本次 RSI 运行，会写入运行记录；不会自动改成全局默认。</small></div><div className="improvement-actions"><button className="primary-button small" onClick={() => void run()} disabled={busy}>{busy ? <span className="button-spinner" /> : <Sparkles size={14} />} {busy ? '检查中…' : '开始自动更新'}</button>{projection?.status === 'published' && <button className="secondary-button small" onClick={() => void rollback()} disabled={busy}><RefreshCcw size={14} /> 回滚这次更新</button>}</div>{projection && <div className="improvement-result"><div><span>固定检查</span><strong>{projection.evaluation?.status === 'passed' ? '通过' : projection.evaluation?.status === 'failed' ? '未通过' : '未评分'}</strong></div><div><span>候选版本</span><strong>{projection.proposal?.candidateVersion ?? '—'}</strong></div><div><span>处理方式</span><strong>{projection.release?.automatic ? '自动记录' : projection.approval ? '需要审批' : '未发布'}</strong></div></div>}{evaluationBundle && <div className="improvement-evidence"><div><span>评分</span><strong>{evaluationBundle.score.value} / {evaluationBundle.score.maxValue}</strong></div><div><span>评测任务</span><strong>{evaluationBundle.task.name}</strong></div><div><span>历史参考</span><strong>{projection?.proposal?.memoryRefs?.length ?? 0} 条记忆</strong></div><div><span>记忆策略</span><strong>{projection?.proposal?.memoryStrategy === 'hybrid' ? '混合模式' : '关键词模式'}</strong></div><p>{evaluationBundle.feedback.summary}</p></div>}{projection?.error && <p className="inline-error">{projection.error.message}</p>}<details className="technical-details"><summary>查看这次更新的依据</summary><p>候选、评分和反馈都保存在本地 RunEvent/Artifact 中，之后可以按运行 ID重新读取。当前检查证明的是流程完整性，不代表模型质量提升或成本下降。</p>{result?.runId && <code>Run：{result.runId}</code>}</details></section>
}

function ProjectBindingCard({ project }: { project: WorkspaceSnapshot['projects'][number] }) {
  return <section className="project-binding-card"><div className="project-binding-heading"><div><span className="card-kicker"><FolderKanban size={13} /> 当前项目的操作边界</span><h2>每次运行都会显示实际副作用</h2></div><span className="read-only-pill"><ShieldCheck size={12} /> 按运行选择</span></div><div className="project-binding-footer"><span>默认：读取文件、查看 Git 状态</span><span>构建、写入或敏感动作会单独标出并逐次审批</span></div><details className="technical-details"><summary>技术详情</summary><div className="project-binding-path"><small>工作区路径</small><code>{project.workspacePath ?? '未提供（本地演示）'}</code></div></details></section>
}

function BuilderContractCard({ productBuilder, busy, onResolve }: { productBuilder?: ProductBuilderProjection; busy: boolean; onResolve: (clarificationId: string, value: string) => Promise<void> }) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  if (!productBuilder) return null
  const unknowns = productBuilder.clarifications.filter((item) => item.status === 'unknown')
  const blockingUnknowns = unknowns.filter((item) => item.blocking)
  const stepLabel = (status: string) => status === 'ready' ? '可执行' : status === 'waiting_user' ? '等待确认' : '阻塞'
  const resolve = async (item: ProductBuilderProjection['clarifications'][number]) => {
    const value = values[item.id]?.trim()
    if (!value || saving || busy) return
    setSaving(item.id)
    try { await onResolve(item.id, value) } finally { setSaving(null) }
  }
  return <section className="card builder-contract-card"><div className="card-heading compact"><div><span className="card-kicker"><CircleHelp size={13} /> 需求澄清与执行计划</span><h2>当前任务还缺什么</h2></div><span className={`contract-status ${blockingUnknowns.length ? 'blocked' : ''}`}>{blockingUnknowns.length ? `${blockingUnknowns.length} 项待确认` : '可以进入审批'}</span></div><div className="clarification-list">{productBuilder.clarifications.map((item) => <div className="clarification-row" key={item.id}><span className={`clarification-dot ${item.status === 'unknown' ? 'unknown' : ''}`} /><div><strong>{item.label}</strong><small>{item.status === 'unknown' ? '未知，不能当成事实' : item.value ?? '已提供'}</small></div>{item.status === 'unknown' && item.blocking ? <div className="clarification-action"><input value={values[item.id] ?? ''} onChange={(event) => setValues((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="填写并确认" disabled={busy || saving === item.id} /><button className="text-button" onClick={() => void resolve(item)} disabled={busy || saving === item.id || !values[item.id]?.trim()}>{saving === item.id ? '保存中…' : '确认'}</button></div> : <span className="clarification-status">{item.status === 'unknown' ? '待补来源' : '已提供'}</span>}</div>)}</div><div className="builder-plan"><div className="builder-plan-heading"><strong>固定执行计划</strong></div><details className="technical-details"><summary>查看计划技术标识</summary><code>{productBuilder.plan.id}</code></details><div className="builder-step-list">{productBuilder.plan.steps.map((step) => <div className="builder-step" key={step.id}><span>{step.label}</span><small className={step.status === 'blocked' ? 'blocked' : step.status === 'waiting_user' ? 'waiting' : ''}>{stepLabel(step.status)}</small></div>)}</div></div>{productBuilder.releaseBlockers.length > 0 && <p className="builder-blocker">当前还不能生成最终产物：{productBuilder.releaseBlockers.join('、')}</p>}</section>
}

function NewRunDialog({ provider, commandId, objective, busy, codexProbe, onProviderChange, onCommandChange, onObjectiveChange, onClose, onSubmit }: { provider: ProviderChoice; commandId: 'project.test' | 'project.build_web'; objective: string; busy: boolean; codexProbe: CodexProbe | null; onProviderChange: (provider: ProviderChoice) => void; onCommandChange: (commandId: 'project.test' | 'project.build_web') => void; onObjectiveChange: (objective: string) => void; onClose: () => void; onSubmit: () => void }) {
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const advancedProviders = ['controlled-command', 'deepseek-product-builder-draft', 'tool-loop-fixture', 'tool-loop-local', 'deepseek-tool-loop', 'tool-fixture', 'tool-git', 'tool-git-diff', 'codex']
  const isAdvancedProvider = advancedProviders.includes(provider)
  useEscape(onClose, true)
  const probeLabel = !codexProbe ? '正在检查本机 Codex CLI…' : codexProbe.status === 'available' ? '可用 · ' + (codexProbe.version ?? '版本未知') : codexProbe.status === 'blocked_environment' ? '暂时无法使用：' + (codexProbe.reason ?? '本机状态目录不可写') : codexProbe.status === 'error' ? '暂时无法使用：' + (codexProbe.reason ?? '未知原因') : '不可用 · ' + (codexProbe.reason ?? '未找到 codex 命令')
  const detailText = provider === 'bound'
    ? '按当前项目的主 Provider 与模型执行，并在运行记录中留下绑定、连接和模型信息；不会自动改用 Fixture。'
    : provider === 'controlled-command'
      ? '只允许两个固定命令：npm run test 或 npm run build:web。预览不会执行，真正执行前必须单次批准；不会开放任意 Shell。'
      : provider === 'codex'
        ? '会调用本机已登录的 Codex CLI；不会读取或展示凭据。'
        : provider === 'deepseek-product-builder-draft'
          ? '调用真实 DeepSeek 生成固定 Schema 草稿；会显示实际模型、用量和缓存回执，草稿必须人工审阅，不能自动发布。'
          : provider === 'deepseek-tool-loop'
            ? '使用服务端配置的 DeepSeek API Key；只开放 filesystem.read，只读当前项目文件，不写入、不删除、不执行 Shell。真实模型质量仍需单独评测。'
            : provider === 'tool-loop-fixture'
              ? '回放模型响应、工具调用、工具结果和最终产物；不调用真实模型、不读取文件、不产生模型费用。'
              : provider === 'tool-loop-local'
                ? '模型决策仍是 Fixture，但会真实读取当前项目内的文件；结果带完整事件和回执，不代表真实模型效果。'
                : provider === 'tool-git-diff'
                  ? '只运行固定的 git diff --stat，读取变更量；不提交、不写入、不删除。'
                  : provider === 'tool-git'
                    ? '只运行固定的 git status --short，读取当前项目改动；不提交、不写入、不删除。'
                    : provider === 'tool-local'
                      ? '只读取当前项目内的 fixture 文件，限制大小并对常见凭据格式做脱敏；不写入、不删除、不执行命令。'
                      : provider === 'tool-fixture'
                        ? '只验证工具权限、路径边界、RunEvent 和 receipt，不读取文件、不执行 Shell。'
                        : '使用本地演示流程，只验证控制面与产物链路，不代表真实模型效果。'
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="run-dialog" role="dialog" aria-modal="true" aria-labelledby="new-run-title" aria-describedby="new-run-help">
      <div className="dialog-heading"><div><span className="card-kicker"><Play size={13} /> Product Builder</span><h2 id="new-run-title">新建一次运行</h2></div><button className="icon-button" aria-label="关闭" onClick={onClose} disabled={busy}><X size={17} /></button></div>
      <label className="form-field"><span>目标 / 想法</span><textarea value={objective} onChange={(event) => onObjectiveChange(event.target.value)} rows={4} placeholder="例如：我想做一个面向独立开发者的 AI 产品" disabled={busy} autoFocus /></label>
      <div className="form-field"><span>执行方式</span><select className="provider-select" value={provider} onChange={(event) => onProviderChange(event.target.value as ProviderChoice)} disabled={busy}>
        <optgroup label="主要方式"><option value="bound">使用当前项目绑定的 Provider</option><option value="fixture">本地演示（无需 Key，仅验证流程）</option><option value="tool-local">只读检查项目文件</option></optgroup>
        {(advancedOpen || isAdvancedProvider) && <optgroup label="高级诊断"><option value="controlled-command">受控测试/构建命令（逐次审批）</option><option value="deepseek-product-builder-draft">DeepSeek Product Builder 草稿（真实模型，待审阅）</option><option value="tool-loop-fixture">Fixture Tool Loop（完整工具回放，无 Key）</option><option value="tool-loop-local">本地只读 Tool Loop（真实读取 + Fixture 决策）</option><option value="deepseek-tool-loop">DeepSeek 只读 Tool Loop（真实模型 + 只读文件）</option><option value="tool-fixture">只读边界检查（不读取文件）</option><option value="tool-git">只读查看 Git 状态</option><option value="tool-git-diff">只读查看 Git 变更摘要</option><option value="codex">Codex 订阅执行桥（只读）</option></optgroup>}
      </select><button type="button" className="advanced-toggle" onClick={() => setAdvancedOpen((value) => !value)} aria-expanded={advancedOpen || isAdvancedProvider}>{advancedOpen || isAdvancedProvider ? '收起高级诊断' : '显示高级诊断选项'}</button></div>
      {provider === 'controlled-command' && <label className="form-field"><span>固定命令</span><select className="provider-select" value={commandId} onChange={(event) => onCommandChange(event.target.value as 'project.test' | 'project.build_web')} disabled={busy}><option value="project.test">运行项目测试 · npm run test</option><option value="project.build_web">构建 Web · npm run build:web</option></select></label>}
      <small id="new-run-help">先选“使用当前项目绑定”运行真实配置；没有绑定或凭据不可用时会明确失败。Fixture 仍可单独用于离线诊断。</small>
      <small>{detailText}</small>
      {provider === 'codex' && <small className={'provider-probe ' + (codexProbe?.status === 'available' ? 'available' : ['error', 'blocked_environment'].includes(codexProbe?.status ?? '') ? 'error' : '')}>本机探针：{probeLabel}</small>}
      <div className="dialog-actions"><button className="secondary-button" onClick={onClose} disabled={busy}>取消</button><button className="primary-button" onClick={onSubmit} disabled={busy || !objective.trim()}>{busy ? <span className="button-spinner" /> : <Play size={14} fill="currentColor" />} {busy ? '运行中…' : '开始运行'}</button></div>
    </section>
  </div>
}

function ExecutionReceiptCard({ execution }: { execution: StartRunResult }) {
  const providerName = execution.provider === 'bound' ? '项目绑定 Provider' : execution.provider === 'controlled-command' ? '本地受控命令' : execution.provider === 'codex' ? 'Codex 订阅执行' : execution.provider === 'deepseek-product-builder-draft' ? 'DeepSeek Product Builder 草稿' : execution.provider === 'deepseek-tool-loop' ? 'DeepSeek 只读 Tool Loop' : execution.provider === 'tool-git-diff' ? '只读 Git 变更摘要' : execution.provider === 'tool-git' ? '只读 Git 状态' : execution.provider === 'tool-loop-local' ? '本地只读 Tool Loop' : execution.provider === 'tool-local' ? '只读项目文件' : execution.provider === 'tool-loop-fixture' ? 'Fixture Tool Loop' : execution.provider === 'tool-fixture' ? '只读边界检查' : '本地演示'
  const status = execution.status === 'waiting_user' ? '等待确认' : execution.status === 'cancelled' ? '已取消' : execution.ok ? '已完成' : '失败'
  return <section className={`execution-card ${execution.ok ? 'success' : 'failure'}`}><div className="card-heading compact"><div><span className="card-kicker"><Terminal size={13} /> 最近一次运行</span><h2>{providerName}</h2></div><StatusPill status={status} /></div><div className="execution-meta"><span>{execution.artifactCount !== undefined ? `产物：${execution.artifactCount}` : execution.provider === 'tool-loop-local' ? 'Fixture 决策 + 真实工具' : execution.isMock ? '本地演示' : '真实执行'}</span><span>{execution.provider === 'deepseek-product-builder-draft' ? '草稿待人工审阅，未替换正式产物' : execution.provider === 'tool-loop-local' ? '真实文件读取，模型质量未验证' : execution.isMock ? '仅验证流程，不代表模型效果' : '已记录执行结果'}</span></div>{execution.error && <p className="execution-error">{execution.error}</p>}{execution.modelReceipt && <ModelReceiptDetails receipt={execution.modelReceipt} />}{execution.output && <pre className="execution-output">{execution.output.slice(0, 1600)}</pre>}<details className="technical-details"><summary>技术详情</summary><div className="execution-meta"><span>Run：{execution.runId ?? '未创建'}</span><span>事件：{execution.eventCount ?? 0}</span>{execution.receiptId && <span>回执：{execution.receiptId}</span>}</div></details></section>
}

function Metric({ label, value, meta, tone, icon: Icon }: { label: string; value: string; meta: string; tone: string; icon: typeof Activity }) { return <div className="metric"><div className={`metric-icon ${tone}`}><Icon size={17} /></div><div><span>{label}</span><strong>{value}</strong><small>{meta}</small></div></div> }
function StatusPill({ status }: { status: string }) {
  const tone = status === '等待确认' ? 'waiting' : status === '失败' ? 'failure' : status === '已取消' ? 'cancelled' : status === '运行中' || status === '排队中' ? 'active' : 'success'
  return <span className={`status-pill ${tone}`}><span />{status}</span>
}
function RunKicker({ status }: { status: string }) { const label = status === '运行中' || status === '排队中' ? '当前运行' : status === '等待确认' ? '等待你的决定' : '最近一次运行'; const tone = status === '失败' ? 'failure' : status === '已取消' ? 'cancelled' : status === '已完成' ? 'done' : status === '等待确认' ? 'waiting' : 'active'; return <span className={`card-kicker run-kicker ${tone}`}><span className="run-status-dot" /> {label}</span> }
function Timeline({ events }: { events: RunEvent[] }) { return <div className="timeline">{events.map((event) => <div className={`timeline-item ${event.kind}`} key={event.id}><div className="timeline-marker">{event.kind === 'done' ? <Check size={12} /> : event.kind === 'failed' ? <X size={12} /> : event.kind === 'waiting' ? <AlertCircle size={13} /> : event.kind === 'active' ? <span className="spinner" /> : <span />}</div><div className="timeline-content"><div className="timeline-title"><strong>{event.label}</strong><span>{event.time}</span></div><p>{event.detail}</p>{event.bot && <span className="event-bot"><Bot size={12} /> {event.bot}</span>}</div></div>)}</div> }
function ApprovalCard({ approval, busy, onAction }: { approval: WorkspaceSnapshot['approval']; busy: boolean; onAction: (action: 'approve' | 'retry') => Promise<void> }) { return <div className="approval-card"><div className="approval-head"><div className="approval-symbol"><AlertCircle size={19} /></div><div><span className="card-kicker">需要你的决定</span><h3>批准一次受控操作</h3></div><span className="approval-time">刚刚</span></div><p>{approval?.description ?? 'Product Builder 已完成当前步骤，等待你批准后继续。'}</p><div className="approval-summary"><span>请求动作</span><strong>{approval?.action ?? '继续 Product Builder 工作流'}</strong><small>权限：{approval?.permissionTier ?? '只读'} · 这一步只批准当前请求，不会改变 Bot 权限。</small></div><div className="approval-actions"><button className="secondary-button" onClick={() => onAction('retry')} disabled={busy}>{approval?.action === 'command.run' ? '拒绝此操作' : '重新运行'}</button><button className="primary-button small" onClick={() => onAction('approve')} disabled={busy}>{busy ? <span className="button-spinner" /> : <Check size={15} />} 确认并继续</button></div></div> }
function ProviderCard({ provider, modelReceipt }: { provider: WorkspaceSnapshot['provider']; modelReceipt?: ProviderModelReceipt }) { const healthLabel = provider.healthy ? '正常' : '不可用'; const isFixture = /fixture/i.test(provider.name) || provider.name === '本地演示'; const displayName = isFixture ? '本地演示' : provider.name; return <div className="provider-card"><div className="card-heading compact"><div><span className="card-kicker">本次运行使用的方式</span><h2>{displayName}</h2></div><span className={`provider-health ${provider.healthy ? '' : 'unhealthy'}`}><span />{healthLabel}</span></div><div className="provider-details"><div><small>用途</small><strong>{isFixture ? '验证流程' : '执行任务'}</strong></div><div><small>费用</small><strong>{isFixture ? '不产生模型费用' : provider.billingSource}</strong></div><div><small>状态</small><strong>{healthLabel}</strong></div></div>{modelReceipt && <ModelReceiptDetails receipt={modelReceipt} />}{!modelReceipt && <p className="provider-note">{isFixture ? '当前没有真实模型用量数据；本地演示不会产生模型费用。' : '当前没有可用的模型回执；失败原因见上方运行记录。'}</p>}<details className="technical-details"><summary>查看技术信息</summary><div className="provider-details"><div><small>模型</small><strong>{provider.model}</strong></div><div><small>认证方式</small><strong>{provider.authMode}</strong></div><div><small>本次延迟</small><strong>{provider.latency}</strong></div></div></details><p className="provider-note disabled-note"><Settings2 size={14} /> Provider 已在上方项目配置卡中管理</p></div> }

function ModelReceiptDetails({ receipt }: { receipt: ProviderModelReceipt }) {
  const cacheLabel = receipt.promptCache.providerReported
    ? receipt.promptCache.status === 'hit' ? '命中（提供方报告）' : receipt.promptCache.status === 'miss' ? '未命中（提供方报告）' : `提供方报告：${receipt.promptCache.status}`
    : '未报告（未知）'
  const usage = [
    receipt.usage.inputTokens === undefined ? null : `输入 ${receipt.usage.inputTokens}`,
    receipt.usage.outputTokens === undefined ? null : `输出 ${receipt.usage.outputTokens}`,
    receipt.usage.cachedInputTokens === undefined ? null : `缓存 Token ${receipt.usage.cachedInputTokens}`,
  ].filter(Boolean).join(' · ') || '用量未知'
  return <details className="model-receipt" data-testid="model-receipt"><summary className="model-receipt-heading"><strong>查看模型用量与缓存详情</strong><span>{receipt.provider.provider} · {receipt.provider.model}</span></summary><div className="model-receipt-grid"><span>用量：{usage}（{receipt.usage.source}）</span><span>提示词缓存：{cacheLabel}</span><span>错误：{receipt.error ? `${receipt.error.code ?? 'provider_error'} · ${receipt.error.message ?? '未知原因'}` : '无'}</span><span>回放：{receipt.replayRef}</span><span>原始响应引用：{receipt.rawResponseRef ?? '无'}</span></div></details>
}
function HelpDialog({ onClose }: { onClose: () => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="run-dialog help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title"><div className="dialog-heading"><div><span className="card-kicker"><CircleHelp size={13} /> 使用说明</span><h2 id="help-title">先确认流程，再接入真实 Provider</h2></div><button className="icon-button" aria-label="关闭帮助" onClick={onClose}><X size={17} /></button></div><div className="help-list"><p><strong>本地演示</strong>只验证工作台、审批、交接和 Artifact 链路，不代表真实模型效果。</p><p><strong>新建运行</strong>默认从本地演示开始；需要检查文件或 Git 时，再从“高级诊断”选择只读工具。</p><p><strong>等待确认</strong>表示系统已停在用户决定点。审批只批准当前受控操作，目标用户等业务选择要在上方澄清卡片中填写。</p></div><div className="dialog-actions"><button className="primary-button" onClick={onClose}>知道了</button></div></section></div>
}
function BotStack({ bots }: { bots: BotData[] }) { return <div className="bot-stack">{bots.map((bot) => <div className="bot-row" key={bot.id}><div className="bot-avatar" style={{ background: bot.color }}>{bot.initials}</div><div className="bot-info"><strong>{bot.name}</strong><span>{bot.role}</span></div><span className={`bot-status ${bot.status === '运行中' ? 'running' : ''}`}><span />{bot.status}</span><ChevronDown size={14} className="row-chevron" /></div>)}</div> }
function ArtifactList({ artifacts }: { artifacts: WorkspaceSnapshot['artifacts'] }) { return <div className="artifact-list">{artifacts.map((artifact) => <div className="artifact-row" key={artifact.id}><div className={`file-type ${artifact.type.toLowerCase()}`}>{artifact.type}</div><div className="artifact-info"><strong>{artifact.name}</strong><span>{artifact.meta}</span></div><span className={`artifact-status ${artifact.status === '草稿' ? 'draft' : ''}`}>{artifact.status}</span><MoreHorizontal size={15} /></div>)}</div> }

function botDataFromProfile(profile: BotProfileRecord, index: number): BotData {
  return {
    id: profile.id,
    name: profile.name,
    role: profile.responsibility,
    initials: profile.name.slice(0, 1),
    color: ['#5c5ae8', '#099d82', '#3478c8', '#ca568a', '#e4873c'][index % 5],
    status: '待机',
    provider: String(profile.providerPolicy.model ?? '本地策略'),
    permission: profile.toolPolicy.permissionTier === 'full_access' ? '完全访问' : profile.toolPolicy.permissionTier === 'workspace_write' ? '工作区写入' : '只读',
    skills: profile.skillIds,
    enabled: profile.enabled,
  }
}

function BotsView({ bots, projectId, onToast }: { bots: BotData[]; projectId: string; onToast: (message: string) => void }) {
  const [botList, setBotList] = useState(bots)
  const [skills, setSkills] = useState<SkillRecord[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [skillDialogOpen, setSkillDialogOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('新 Bot')
  const [responsibility, setResponsibility] = useState('处理一个明确、可审计的项目职责')
  const [skillName, setSkillName] = useState('项目研究 Skill')
  const [skillDescription, setSkillDescription] = useState('把一个职责固定成可复用、可追溯的工作规则')
  const [skillInstructions, setSkillInstructions] = useState('只读取当前项目允许的资料，输出结构化结果，并保留未知项与来源。')
  useEscape(() => { if (!busy) { setDialogOpen(false); setSkillDialogOpen(false) } }, dialogOpen || skillDialogOpen)
  useEffect(() => {
    let active = true
    setBotList(bots)
    void workspaceApi.listBots(projectId).then((profiles) => {
      if (!active || !profiles) return
      if (!profiles.length) { if (!bots.length) setBotList([]); return }
      setBotList(profiles.map((profile, index) => botDataFromProfile(profile, index)))
    })
    void workspaceApi.listSkills().then((items) => { if (active) setSkills(items) }).catch((error) => { if (active) onToast(`读取 Skill 失败：${error instanceof Error ? error.message : '未知错误'}`) })
    return () => { active = false }
  }, [bots, onToast, projectId])
  const handleCreate = async () => {
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      const created = await workspaceApi.createBot({ projectId, name: name.trim(), description: '由本地工作台创建的 Bot', responsibility: responsibility.trim() })
      setBotList((current) => [...current, botDataFromProfile(created, current.length)])
      setDialogOpen(false)
      onToast(`已创建 ${created.name}`)
    } catch (error) {
      onToast(`创建失败：${error instanceof Error ? error.message : '未知错误'}`)
    } finally { setBusy(false) }
  }
  const handleDuplicate = async (bot: BotData) => {
    if (busy) return
    setBusy(true)
    try {
      const created = await workspaceApi.duplicateBot(bot.id, projectId)
      setBotList((current) => [...current, botDataFromProfile(created, current.length)])
      onToast(`已复制 ${bot.name}`)
    } catch (error) {
      onToast(`复制失败：${error instanceof Error ? error.message : '未知错误'}`)
    } finally { setBusy(false) }
  }
  const handleDisable = async (bot: BotData) => {
    if (busy || bot.enabled === false) return
    setBusy(true)
    try {
      await workspaceApi.disableBot(bot.id, projectId)
      setBotList((current) => current.map((item) => item.id === bot.id ? { ...item, enabled: false } : item))
      onToast(`已停用 ${bot.name}；恢复功能将在后续版本开放`)
    } catch (error) {
      onToast(`停用失败：${error instanceof Error ? error.message : '未知错误'}`)
    } finally { setBusy(false) }
  }
  const handleBindSkill = async (bot: BotData, skillId: string) => {
    if (busy || bot.enabled === false) return
    setBusy(true)
    try {
      const updated = await workspaceApi.setBotSkills(bot.id, projectId, skillId ? [skillId] : [])
      setBotList((current) => current.map((item) => item.id === bot.id ? botDataFromProfile(updated, current.findIndex((candidate) => candidate.id === bot.id)) : item))
      onToast(skillId ? `已把 Skill 绑定到 ${bot.name}` : `已解除 ${bot.name} 的 Skill 绑定`)
    } catch (error) {
      onToast(`绑定失败：${error instanceof Error ? error.message : '未知错误'}`)
    } finally { setBusy(false) }
  }
  const handleCreateSkill = async () => {
    if (busy || !skillName.trim() || !skillDescription.trim() || !skillInstructions.trim()) return
    setBusy(true)
    try {
      const created = await workspaceApi.createSkill({ name: skillName.trim(), description: skillDescription.trim(), version: '1.0.0', instructions: skillInstructions.trim() })
      setSkills((current) => [...current, created])
      setSkillDialogOpen(false)
      onToast(`已登记 Skill：${created.name}`)
    } catch (error) {
      onToast(`Skill 登记失败：${error instanceof Error ? error.message : '未知错误'}`)
    } finally { setBusy(false) }
  }
  const handleToggleSkill = async (skill: SkillRecord) => {
    if (busy) return
    setBusy(true)
    try {
      const updated = await workspaceApi.toggleSkill(skill.id, !skill.enabled)
      setSkills((current) => current.map((item) => item.id === skill.id ? updated : item))
      onToast(`${updated.name} 已${updated.enabled ? '启用' : '停用'}`)
    } catch (error) {
      onToast(`Skill 更新失败：${error instanceof Error ? error.message : '未知错误'}`)
    } finally { setBusy(false) }
  }
  return <div className="bots-view"><div className="view-toolbar"><div className="view-hint"><Bot size={15} /><span>已显示当前项目的全部 Bot</span></div><div className="toolbar-actions"><button className="secondary-button" onClick={() => setSkillDialogOpen(true)} disabled={busy}><Plus size={15} /> 新建 Skill</button><button className="primary-button" onClick={() => setDialogOpen(true)} disabled={busy}><Plus size={15} /> 创建 Bot</button></div></div><div className="bot-cards">{botList.map((bot) => <article className={`bot-card ${bot.enabled === false ? 'disabled' : ''}`} key={bot.id}><div className="bot-card-head"><div className="bot-avatar large" style={{ background: bot.color }}>{bot.initials}</div><span className={`bot-status ${bot.status === '运行中' && bot.enabled !== false ? 'running' : ''}`}><span />{bot.enabled === false ? '已停用' : bot.status}</span><button className="icon-button" aria-label={`${bot.name} 操作`} onClick={() => void handleDuplicate(bot)} disabled={busy || bot.enabled === false}><MoreHorizontal size={16} /></button></div><h3>{bot.name}</h3><p>{bot.role}</p><div className="bot-tags">{bot.skills.length ? bot.skills.map((skill) => <span key={skill}>{skills.find((item) => item.id === skill)?.name ?? skill}</span>) : <span>未绑定 Skill</span>}</div>{skills.length > 0 && <label className="skill-binding"><span>绑定主 Skill</span><select value={bot.skills[0] ?? ''} onChange={(event) => void handleBindSkill(bot, event.target.value)} disabled={busy || bot.enabled === false}><option value="">未绑定</option>{skills.map((skill) => <option key={skill.id} value={skill.id} disabled={!skill.enabled}>{skill.name}{skill.enabled ? '' : '（已停用）'}</option>)}</select></label>}<div className="bot-card-footer"><span><Code2 size={13} /> {bot.provider.includes('Fixture') ? '本地演示' : bot.provider}</span><span><ShieldCheck size={13} /> {bot.permission}</span></div><div className="bot-card-actions"><button className="text-button" onClick={() => void handleDuplicate(bot)} disabled={busy || bot.enabled === false}>复制</button><button className="text-button danger" onClick={() => void handleDisable(bot)} disabled={busy || bot.enabled === false}>停用</button></div></article>)}</div><section className="card skill-registry"><div className="card-heading compact"><div><span className="card-kicker">可复用工作规则</span><h2>Skills</h2></div><span className="muted">{skills.length} 个本机 Skill</span></div><p className="card-copy">Skill 把一项职责固定成可复用规则。当前版本只做登记、启停和绑定；每次运行仍由 RunEvent 记录，不自动自我扩张。</p>{skills.length === 0 ? <div className="empty-state compact-empty">还没有 Skill。先新建一个，再在上面的 Bot 卡片中绑定。</div> : <div className="skill-list">{skills.map((skill) => <div className="skill-row" key={skill.id}><div><strong>{skill.name}</strong><span>{skill.description} · v{skill.version}</span></div><button className="text-button" onClick={() => void handleToggleSkill(skill)} disabled={busy}>{skill.enabled ? '停用' : '启用'}</button></div>)}</div>}</section>{dialogOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setDialogOpen(false) }}><section className="run-dialog" role="dialog" aria-modal="true" aria-labelledby="create-bot-title"><div className="dialog-heading"><div><span className="card-kicker"><Bot size={13} /> Bot 管理</span><h2 id="create-bot-title">创建 Bot</h2></div><button className="icon-button" aria-label="关闭" onClick={() => !busy && setDialogOpen(false)} disabled={busy}><X size={17} /></button></div><label className="form-field"><span>名称</span><input value={name} onChange={(event) => setName(event.target.value)} disabled={busy} /></label><label className="form-field"><span>职责</span><textarea value={responsibility} onChange={(event) => setResponsibility(event.target.value)} rows={3} disabled={busy} /></label><p className="form-hint">默认权限为只读；工具和权限仍需通过现有审批边界调整。</p><div className="dialog-actions"><button className="secondary-button" onClick={() => setDialogOpen(false)} disabled={busy}>取消</button><button className="primary-button" onClick={() => void handleCreate()} disabled={busy || !name.trim()}>{busy ? '保存中…' : '创建 Bot'}</button></div></section></div>}{skillDialogOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setSkillDialogOpen(false) }}><section className="run-dialog" role="dialog" aria-modal="true" aria-labelledby="create-skill-title"><div className="dialog-heading"><div><span className="card-kicker"><Sparkles size={13} /> Skill 管理</span><h2 id="create-skill-title">新建 Skill</h2></div><button className="icon-button" aria-label="关闭 Skill 创建" onClick={() => !busy && setSkillDialogOpen(false)} disabled={busy}><X size={17} /></button></div><label className="form-field"><span>名称</span><input value={skillName} onChange={(event) => setSkillName(event.target.value)} disabled={busy} /></label><label className="form-field"><span>说明</span><input value={skillDescription} onChange={(event) => setSkillDescription(event.target.value)} disabled={busy} /></label><label className="form-field"><span>执行规则</span><textarea value={skillInstructions} onChange={(event) => setSkillInstructions(event.target.value)} rows={4} disabled={busy} /></label><p className="form-hint">只登记工作规则，不自动提升权限、不自动发布，也不会创建新的 Bot。</p><div className="dialog-actions"><button className="secondary-button" onClick={() => setSkillDialogOpen(false)} disabled={busy}>取消</button><button className="primary-button" onClick={() => void handleCreateSkill()} disabled={busy || !skillName.trim() || !skillDescription.trim() || !skillInstructions.trim()}>{busy ? '保存中…' : '登记 Skill'}</button></div></section></div>}</div>
}

function RunsView({ snapshot, busy, refreshing, onAction, onRefresh }: { snapshot: WorkspaceSnapshot; busy: boolean; refreshing: boolean; onAction: (action: 'approve' | 'retry') => Promise<void>; onRefresh: () => Promise<void> }) { return <div className="runs-view"><div className="runs-toolbar"><div className="filter-chip active">全部 <span>{snapshot.run.events.length}</span></div><div className="filter-chip">运行中 <span>{snapshot.run.status === '运行中' ? 1 : 0}</span></div><div className="filter-chip">已完成 <span>{snapshot.run.status === '已完成' ? 1 : 0}</span></div><div className="runs-actions"><span className="view-hint"><History size={14} /> 按时间筛选将在后续版本提供</span><button className="secondary-button" onClick={() => void onRefresh()} disabled={refreshing}><RefreshCcw size={14} /> {refreshing ? '刷新中…' : '刷新'}</button></div></div><div className="card full-run-card"><div className="card-heading"><div><RunKicker status={snapshot.run.status} /><h2>{snapshot.run.title}</h2></div><StatusPill status={snapshot.run.status} /></div><div className="run-meta"><span><Clock3 size={14} /> 开始于 {snapshot.run.startedAt}</span><span>方式：{/fixture/i.test(snapshot.provider.name) ? '本地演示' : snapshot.provider.model}</span></div>{snapshot.run.receipt?.modelReceipt && <ModelReceiptDetails receipt={snapshot.run.receipt.modelReceipt} />}<Timeline events={snapshot.run.events} />{snapshot.run.status === '等待确认' && <div className="inline-approval"><AlertCircle size={16} /><span>此运行正在等待用户确认。</span><button className="primary-button small" onClick={() => onAction('approve')} disabled={busy}>确认继续</button></div>}</div></div> }
function ArtifactsView({ artifacts, projectId }: { artifacts: WorkspaceSnapshot['artifacts']; projectId: string }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ArtifactDetail | null>(null)
  const [sources, setSources] = useState<SourceDetail[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEscape(() => setSelectedId(null), Boolean(selectedId) && !loading)
  const openArtifact = async (id: string) => {
    setSelectedId(id)
    setDetail(null)
    setError(null)
    setLoading(true)
    try {
      const next = await workspaceApi.getArtifactDetail(id, projectId)
      setDetail(next)
      if (!next) {
        setError('无法读取这个 Artifact，请刷新本地服务后重试。')
        setSources([])
        return
      }
      if (next.sourceRefs.length) {
        const resolved = await Promise.all(next.sourceRefs.map((sourceId) => workspaceApi.getSourceDetail(sourceId, next.projectId)))
        setSources(resolved.filter((source): source is SourceDetail => Boolean(source)))
      } else setSources([])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法读取本地 Artifact')
      setSources([])
    } finally {
      setLoading(false)
    }
  }
  return <div className="artifacts-view"><div className="artifacts-toolbar"><div className="view-hint"><Search size={15} /><span>当前显示已生成产物</span></div><div className="view-hint"><LayoutDashboard size={15} /><span>更多视图将在后续版本提供</span></div></div><div className="artifact-table card"><div className="table-head"><span>名称</span><span>类型</span><span>状态</span><span>最后更新</span><span /></div>{artifacts.map((artifact, index) => <div className="table-row" key={artifact.id} role="button" tabIndex={0} aria-label={`打开产物 ${artifact.name}`} onClick={() => void openArtifact(artifact.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void openArtifact(artifact.id) } }}><div className="table-name"><div className={`file-type ${artifact.type.toLowerCase()}`}>{artifact.type}</div><div><strong>{artifact.name}</strong><small>{artifact.meta}</small></div></div><span>{artifact.type === 'JSON' ? '证据账本' : '项目文档'}</span><span className={`artifact-status ${artifact.status === '草稿' ? 'draft' : ''}`}>{artifact.status}</span><span>{index === 0 ? '刚刚' : `${index + 1} 小时前`}</span><MoreHorizontal size={15} /></div>)}</div>{selectedId && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedId(null) }}><section className="run-dialog artifact-preview" role="dialog" aria-modal="true" aria-labelledby="artifact-preview-title"><div className="dialog-heading"><div><span className="card-kicker"><FileText size={13} /> 产物预览</span><h2 id="artifact-preview-title">{detail?.name ?? (loading ? '加载中…' : '读取失败')}</h2></div><button className="icon-button" aria-label="关闭预览" onClick={() => setSelectedId(null)}><X size={17} /></button></div>{loading && <p>正在读取本地持久化产物…</p>}{error && <p className="execution-error">{error}</p>}{detail && <><div className="execution-meta"><span>状态：{detail.releaseStatus === 'final' ? '最终产物' : detail.releaseStatus === 'draft' ? '草稿' : '状态未知'}</span><span>类型：{detail.contentType}</span></div><pre className="execution-output">{detail.content}</pre><div className="artifact-sources"><strong>来源引用</strong>{sources.length ? sources.map((source) => <span key={source.id}>{source.title ?? source.uri} · {source.uri}</span>) : <small>当前没有来源引用，或来源尚未进入本地实体表。</small>}</div>{detail.releaseStatus === 'draft' && <p className="execution-error">当前仍是草稿：{detail.releaseState?.releaseBlockers.join('、') || '等待释放状态'}</p>}</>}</section></div>}</div>
}

export default App
