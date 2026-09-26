import { useEffect, useMemo, useState } from 'react'
import {
  Activity, AlertCircle, ArrowRight, Bot, Check, ChevronDown, CircleHelp, Clock3, Code2, Command, FileText,
  FolderKanban, GitBranch, History, LayoutDashboard, Menu, MoreHorizontal, Play, Plus, RefreshCcw, Search,
  Settings2, ShieldCheck, Sparkles, Terminal, UserRound, X,
} from 'lucide-react'
import { workspaceApi, type Bot as BotData, type RunEvent, type WorkspaceSnapshot } from './lib/api'

type View = 'overview' | 'bots' | 'runs' | 'artifacts'

function App() {
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null)
  const [view, setView] = useState<View>('overview')
  const [projectId, setProjectId] = useState('product-builder')
  const [menuOpen, setMenuOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [approvalOpen, setApprovalOpen] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => { workspaceApi.getSnapshot().then(setSnapshot) }, [])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 3200)
    return () => window.clearTimeout(timer)
  }, [toast])

  const project = snapshot?.projects.find((item) => item.id === projectId) ?? snapshot?.projects[0]
  const handleAction = async (action: 'approve' | 'retry') => {
    if (!snapshot || busy) return
    setBusy(true)
    const result = action === 'approve' ? await workspaceApi.approveRun(snapshot.run.id) : await workspaceApi.retryRun(snapshot.run.id)
    if (result.ok) {
      setApprovalOpen(action === 'retry')
      setToast(action === 'approve' ? '已确认，Architecture Bot 将继续工作' : '已重新加入运行队列')
    }
    setBusy(false)
  }

  if (!snapshot || !project) return <div className="boot-screen"><div className="brand-mark">A</div><span>正在载入本地工作区…</span></div>

  return (
    <div className="app-shell">
      <Sidebar view={view} setView={setView} projects={snapshot.projects} selected={projectId} onProjectChange={setProjectId} />
      <main className="main-area">
        <header className="topbar">
          <div className="mobile-menu"><Menu size={18} /></div>
          <div className="breadcrumbs"><span>项目</span><ChevronDown size={14} /><strong>{project.name}</strong></div>
          <div className="topbar-actions">
            <div className="connection"><span className={`pulse-dot ${snapshot.source === 'fixture' ? 'fixture-dot' : ''}`} /> {snapshot.source === 'fixture' ? 'Fixture 演示模式' : '本地服务正常'}</div>
            <button className="icon-button" aria-label="搜索"><Search size={17} /></button>
            <button className="icon-button" aria-label="帮助"><CircleHelp size={17} /></button>
            <div className="avatar">黄</div>
          </div>
        </header>
        <div className="content">
          <PageHeader view={view} project={project} onNewRun={() => setToast('已创建新的 Product Builder 运行草稿')} />
          {view === 'overview' && <Overview snapshot={snapshot} approvalOpen={approvalOpen} busy={busy} onAction={handleAction} onNavigate={setView} />}
          {view === 'bots' && <BotsView bots={snapshot.bots} onToast={setToast} />}
          {view === 'runs' && <RunsView snapshot={snapshot} onAction={handleAction} busy={busy} />}
          {view === 'artifacts' && <ArtifactsView artifacts={snapshot.artifacts} />}
        </div>
      </main>
      {toast && <div className="toast"><Check size={16} />{toast}<button onClick={() => setToast('')}><X size={14} /></button></div>}
    </div>
  )
}

function Sidebar({ view, setView, projects, selected, onProjectChange }: { view: View; setView: (view: View) => void; projects: WorkspaceSnapshot['projects']; selected: string; onProjectChange: (id: string) => void }) {
  const items: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'overview', label: '工作台概览', icon: LayoutDashboard }, { id: 'bots', label: 'Bots', icon: Bot }, { id: 'runs', label: '运行记录', icon: Activity }, { id: 'artifacts', label: 'Artifacts', icon: FileText },
  ]
  return <aside className="sidebar">
    <div className="logo-row"><div className="logo">A</div><div><div className="logo-name">Agent Workspace</div><div className="logo-caption">本地项目工作台</div></div></div>
    <button className="new-project" onClick={() => window.alert('项目创建 API 尚未接入，当前使用本地 Fixture')}><Plus size={16} /> 新建项目</button>
    <nav className="nav-list">{items.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${view === id ? 'active' : ''}`} onClick={() => setView(id)}><Icon size={17} /><span>{label}</span>{id === 'runs' && <span className="nav-badge">1</span>}</button>)}</nav>
    <div className="sidebar-section"><div className="section-label">我的项目 <button aria-label="更多项目"><MoreHorizontal size={14} /></button></div>{projects.map((item) => <button key={item.id} className={`project-item ${selected === item.id ? 'selected' : ''}`} onClick={() => onProjectChange(item.id)}><span className="project-icon"><FolderKanban size={14} /></span><span className="project-copy"><strong>{item.name}</strong><small>{item.activeRun ?? item.description}</small></span></button>)}</div>
    <div className="sidebar-bottom"><button className="nav-item"><Settings2 size={17} /> 设置</button><div className="privacy-note"><ShieldCheck size={15} /><span>数据保存在本机<br /><small>隐私模式已开启</small></span></div></div>
  </aside>
}

function PageHeader({ view, project, onNewRun }: { view: View; project: WorkspaceSnapshot['projects'][number]; onNewRun: () => void }) {
  const titles: Record<View, [string, string]> = { overview: ['工作台概览', '继续推进你的产品想法，所有运行和证据都在这里。'], bots: ['Bots 管理', '配置职责、工具与权限，让每个 Bot 都知道自己的边界。'], runs: ['运行记录', '查看每次运行的事件、交接和恢复状态。'], artifacts: ['Artifacts', '集中查看项目产物与来源证据。'] }
  return <div className="page-header"><div><div className="eyebrow"><FolderKanban size={14} /> {project.name}</div><h1>{titles[view][0]}</h1><p>{titles[view][1]}</p></div>{view === 'overview' && <button className="primary-button" onClick={onNewRun}><Play size={15} fill="currentColor" /> 新建一次运行</button>}</div>
}

function Overview({ snapshot, approvalOpen, busy, onAction, onNavigate }: { snapshot: WorkspaceSnapshot; approvalOpen: boolean; busy: boolean; onAction: (action: 'approve' | 'retry') => Promise<void>; onNavigate: (view: View) => void }) {
  return <>
    <div className="metric-grid"><Metric label="进行中的运行" value="1" meta="需要你的决定" tone="purple" icon={Activity} /><Metric label="活跃 Bots" value="1 / 5" meta="项目总控正在工作" tone="green" icon={Bot} /><Metric label="本周产物" value="12" meta="+4 比上周" tone="orange" icon={FileText} /><Metric label="平均响应时间" value="1.8s" meta="DeepSeek API" tone="blue" icon={Clock3} /></div>
    <div className="workspace-grid"><section className="card run-card"><div className="card-heading"><div><span className="card-kicker"><span className="live-dot" /> 当前运行</span><h2>{snapshot.run.title}</h2></div><StatusPill status={snapshot.run.status} /></div><div className="run-meta"><span><GitBranch size={14} /> {snapshot.run.id}</span><span><Clock3 size={14} /> 已运行 {snapshot.run.elapsed}</span><button onClick={() => onNavigate('runs')}>查看完整记录 <ArrowRight size={14} /></button></div><div className="progress-row"><span>整体进度</span><strong>{snapshot.run.progress}%</strong></div><div className="progress"><span style={{ width: `${snapshot.run.progress}%` }} /></div><Timeline events={snapshot.run.events} /></section><section className="right-column">{approvalOpen && <ApprovalCard busy={busy} onAction={onAction} />}<ProviderCard provider={snapshot.provider} /></section></div>
    <div className="lower-grid"><section className="card"><div className="card-heading compact"><div><span className="card-kicker">项目 Bots</span><h2>正在协作的角色</h2></div><button className="text-button" onClick={() => onNavigate('bots')}>管理 Bots <ArrowRight size={14} /></button></div><BotStack bots={snapshot.bots} /></section><section className="card"><div className="card-heading compact"><div><span className="card-kicker">最近产物</span><h2>可追溯的输出</h2></div><button className="text-button" onClick={() => onNavigate('artifacts')}>查看全部 <ArrowRight size={14} /></button></div><ArtifactList artifacts={snapshot.artifacts.slice(0, 3)} /></section></div>
  </>
}

function Metric({ label, value, meta, tone, icon: Icon }: { label: string; value: string; meta: string; tone: string; icon: typeof Activity }) { return <div className="metric"><div className={`metric-icon ${tone}`}><Icon size={17} /></div><div><span>{label}</span><strong>{value}</strong><small>{meta}</small></div></div> }
function StatusPill({ status }: { status: string }) { return <span className={`status-pill ${status === '等待确认' ? 'waiting' : 'success'}`}><span />{status}</span> }
function Timeline({ events }: { events: RunEvent[] }) { return <div className="timeline">{events.map((event) => <div className={`timeline-item ${event.kind}`} key={event.id}><div className="timeline-marker">{event.kind === 'done' ? <Check size={12} /> : event.kind === 'waiting' ? <AlertCircle size={13} /> : event.kind === 'active' ? <span className="spinner" /> : <span />}</div><div className="timeline-content"><div className="timeline-title"><strong>{event.label}</strong><span>{event.time}</span></div><p>{event.detail}</p>{event.bot && <span className="event-bot"><Bot size={12} /> {event.bot}</span>}</div></div>)}</div> }
function ApprovalCard({ busy, onAction }: { busy: boolean; onAction: (action: 'approve' | 'retry') => Promise<void> }) { return <div className="approval-card"><div className="approval-head"><div className="approval-symbol"><AlertCircle size={19} /></div><div><span className="card-kicker">需要你的决定</span><h3>确认目标用户</h3></div><span className="approval-time">刚刚</span></div><p>Product Bot 发现两个可能的切入点。确认后，Architecture Bot 才会继续设计技术方案。</p><div className="choice-list"><label className="choice checked"><span className="radio" /><span><strong>独立创作者</strong><small>需要快速产出短视频内容的个人创作者</small></span><Check size={16} /></label><label className="choice"><span className="radio" /><span><strong>企业内容团队</strong><small>需要多人协作与品牌管理的团队</small></span></label></div><div className="approval-actions"><button className="secondary-button" onClick={() => onAction('retry')} disabled={busy}>修改问题</button><button className="primary-button small" onClick={() => onAction('approve')} disabled={busy}>{busy ? <span className="button-spinner" /> : <Check size={15} />} 确认并继续</button></div></div> }
function ProviderCard({ provider }: { provider: WorkspaceSnapshot['provider'] }) { return <div className="provider-card"><div className="card-heading compact"><div><span className="card-kicker">当前 Provider</span><h2>{provider.name}</h2></div><span className="provider-health"><span />正常</span></div><div className="provider-details"><div><small>模型</small><strong>{provider.model}</strong></div><div><small>认证方式</small><strong>{provider.authMode}</strong></div><div><small>本次延迟</small><strong>{provider.latency}</strong></div></div><button className="provider-link"><Settings2 size={14} /> 管理 Provider 设置 <ArrowRight size={14} /></button></div> }
function BotStack({ bots }: { bots: BotData[] }) { return <div className="bot-stack">{bots.map((bot) => <div className="bot-row" key={bot.id}><div className="bot-avatar" style={{ background: bot.color }}>{bot.initials}</div><div className="bot-info"><strong>{bot.name}</strong><span>{bot.role}</span></div><span className={`bot-status ${bot.status === '运行中' ? 'running' : ''}`}><span />{bot.status}</span><ChevronDown size={14} className="row-chevron" /></div>)}</div> }
function ArtifactList({ artifacts }: { artifacts: WorkspaceSnapshot['artifacts'] }) { return <div className="artifact-list">{artifacts.map((artifact) => <div className="artifact-row" key={artifact.id}><div className={`file-type ${artifact.type.toLowerCase()}`}>{artifact.type}</div><div className="artifact-info"><strong>{artifact.name}</strong><span>{artifact.meta}</span></div><span className={`artifact-status ${artifact.status === '草稿' ? 'draft' : ''}`}>{artifact.status}</span><MoreHorizontal size={15} /></div>)}</div> }

function BotsView({ bots, onToast }: { bots: BotData[]; onToast: (message: string) => void }) { return <div className="bots-view"><div className="view-toolbar"><div className="search-field"><Search size={15} /><input placeholder="搜索 Bot" /></div><button className="primary-button" onClick={() => onToast('Bot 创建 API 尚未接入，当前仅展示配置界面')}><Plus size={15} /> 创建 Bot</button></div><div className="bot-cards">{bots.map((bot) => <article className="bot-card" key={bot.id}><div className="bot-card-head"><div className="bot-avatar large" style={{ background: bot.color }}>{bot.initials}</div><span className={`bot-status ${bot.status === '运行中' ? 'running' : ''}`}><span />{bot.status}</span><button className="icon-button"><MoreHorizontal size={16} /></button></div><h3>{bot.name}</h3><p>{bot.role}</p><div className="bot-tags">{bot.skills.map((skill) => <span key={skill}>{skill}</span>)}</div><div className="bot-card-footer"><span><Code2 size={13} /> {bot.provider}</span><span><ShieldCheck size={13} /> {bot.permission}</span></div></article>)}</div></div> }

function RunsView({ snapshot, busy, onAction }: { snapshot: WorkspaceSnapshot; busy: boolean; onAction: (action: 'approve' | 'retry') => Promise<void> }) { return <div className="runs-view"><div className="runs-toolbar"><div className="filter-chip active">全部 <span>3</span></div><div className="filter-chip">运行中 <span>1</span></div><div className="filter-chip">已完成 <span>12</span></div><div className="runs-actions"><button className="secondary-button"><History size={14} /> 最近 7 天</button><button className="secondary-button"><RefreshCcw size={14} /> 刷新</button></div></div><div className="card full-run-card"><div className="card-heading"><div><span className="card-kicker"><span className="live-dot" /> 运行详情</span><h2>{snapshot.run.title}</h2></div><StatusPill status={snapshot.run.status} /></div><div className="run-meta"><span><GitBranch size={14} /> {snapshot.run.id}</span><span><Clock3 size={14} /> 开始于 {snapshot.run.startedAt}</span><span>Provider：{snapshot.provider.model}</span></div><Timeline events={snapshot.run.events} />{snapshot.run.status === '等待确认' && <div className="inline-approval"><AlertCircle size={16} /><span>此运行正在等待用户确认目标用户。</span><button className="primary-button small" onClick={() => onAction('approve')} disabled={busy}>确认继续</button></div>}</div></div> }
function ArtifactsView({ artifacts }: { artifacts: WorkspaceSnapshot['artifacts'] }) { return <div className="artifacts-view"><div className="artifacts-toolbar"><div className="search-field"><Search size={15} /><input placeholder="搜索产物" /></div><div className="view-toggle"><button className="selected"><LayoutDashboard size={15} /></button><button><Menu size={15} /></button></div></div><div className="artifact-table card"><div className="table-head"><span>名称</span><span>类型</span><span>状态</span><span>最后更新</span><span /></div>{artifacts.map((artifact, index) => <div className="table-row" key={artifact.id}><div className="table-name"><div className={`file-type ${artifact.type.toLowerCase()}`}>{artifact.type}</div><div><strong>{artifact.name}</strong><small>{artifact.meta}</small></div></div><span>{artifact.type === 'JSON' ? '证据账本' : '项目文档'}</span><span className={`artifact-status ${artifact.status === '草稿' ? 'draft' : ''}`}>{artifact.status}</span><span>{index === 0 ? '刚刚' : `${index + 1} 小时前`}</span><button className="icon-button"><MoreHorizontal size={15} /></button></div>)}</div></div> }

export default App
