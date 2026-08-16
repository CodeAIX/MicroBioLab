import { createContext, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, NavLink, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { api, ApiClientError } from "./api";

type User = { id: string; email: string; role: "ADMIN" };
type Experiment = { id: string; slug: string; title: string; description: string; category: string; status: string; active_version_id?: string; active_version_number?: number; version_count?: number; updated_at: string };
type Version = { id: string; version_number: number; status: string; job_status: string; source_sha256: string; builder_version?: string; build_warnings: string[]; build_imports: string[]; error_code?: string; error_message?: string; built_at?: string };
type PublicExperiment = { slug: string; title: string; description: string; category: string; cover_path?: string; version: string; iframeUrl: string };

const statusNames: Record<string, string> = { draft: "草稿", queued: "排队中", running: "构建中", building: "构建中", success: "构建成功", failed: "构建失败", published: "已发布", hidden: "已隐藏", archived: "已归档" };
const versionName = (n: number) => `v${String(n).padStart(6, "0")}`;

function ErrorNotice({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : "发生未知错误";
  const code = error instanceof ApiClientError ? error.code : "ERROR";
  return <div className="notice error"><strong>{code}</strong><span>{message}</span></div>;
}

function Status({ value }: { value: string }) { return <span className={`status status-${value}`}>{statusNames[value] ?? value}</span>; }
function Empty({ children }: { children: ReactNode }) { return <div className="empty">{children}</div>; }
function Loading() { return <div className="loading"><span />正在加载…</div>; }

const AuthContext = createContext<{ user: User | null; loading: boolean; refresh: () => Promise<void> }>({ user: null, loading: true, refresh: async () => undefined });
function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = async () => { try { const data = await api<{ user: User | null }>("/api/auth/me"); setUser(data.user); } finally { setLoading(false); } };
  useEffect(() => { void refresh(); }, []);
  return <AuthContext.Provider value={{ user, loading, refresh }}>{children}</AuthContext.Provider>;
}

function PublicHome() {
  const [items, setItems] = useState<PublicExperiment[] | null>(null);
  const [error, setError] = useState<unknown>();
  useEffect(() => { api<{ experiments: PublicExperiment[] }>("/api/public/experiments").then((x) => setItems(x.experiments)).catch(setError); }, []);
  return <div className="public-page">
    <header className="public-header"><Link className="brand" to="/"><span className="brand-mark">μ</span><span>医学微生物学<br/><small>虚拟仿真实验平台</small></span></Link><Link className="button ghost" to="/login">管理员登录</Link></header>
    <section className="hero"><div><p className="eyebrow">MICROBIOLOGY VIRTUAL LAB</p><h1>在安全、可复现的环境中<br/>探索微观世界</h1><p>面向医学微生物学教学的交互式虚拟实验资源。</p></div><div className="hero-art"><span>🧫</span><span>🔬</span><span>🧬</span></div></section>
    <main className="public-main"><div className="section-heading"><div><p className="eyebrow">EXPERIMENTS</p><h2>实验资源</h2></div><span>{items?.length ?? 0} 个已发布实验</span></div><ErrorNotice error={error}/>
      {!items ? <Loading/> : items.length === 0 ? <Empty>暂时没有已发布实验</Empty> : <div className="cards">{items.map((item) => <article className="experiment-card" key={item.slug}><div className="card-cover">{item.cover_path ? <img src={`/covers/${item.cover_path}`} alt=""/> : <span>MICRO<br/>LAB</span>}</div><div className="card-body"><div className="card-meta"><span>{item.category || "未分类"}</span><span>{item.version}</span></div><h3>{item.title}</h3><p>{item.description || "暂无简介"}</p><Link className="text-link" to={`/experiments/${item.slug}`}>进入实验 <span>→</span></Link></div></article>)}</div>}
    </main><footer>医学微生物学虚拟仿真实验平台 · V1</footer>
  </div>;
}

function PublicExperimentPage() {
  const { slug } = useParams(); const [item, setItem] = useState<PublicExperiment>(); const [error, setError] = useState<unknown>();
  useEffect(() => { api<{ experiment: PublicExperiment }>(`/api/public/experiments/${slug}`).then((x) => setItem(x.experiment)).catch(setError); }, [slug]);
  if (error) return <main className="center-panel"><ErrorNotice error={error}/><Link to="/">返回首页</Link></main>;
  if (!item) return <Loading/>;
  return <div className="lab-shell"><header><Link to="/">← 返回实验列表</Link><div><strong>{item.title}</strong><span>{item.version}</span></div></header><iframe title={item.title} src={item.iframeUrl} sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer" /></div>;
}

function Login() {
  const auth = useContext(AuthContext); const navigate = useNavigate(); const [error, setError] = useState<unknown>(); const [busy, setBusy] = useState(false);
  if (auth.user) return <Navigate to="/dashboard" replace/>;
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setBusy(true); setError(undefined); const data = new FormData(event.currentTarget); try { await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: data.get("email"), password: data.get("password") }) }); await auth.refresh(); navigate("/dashboard"); } catch (e) { setError(e); } finally { setBusy(false); } };
  return <div className="login-page"><div className="login-aside"><Link className="brand light" to="/"><span className="brand-mark">μ</span><span>医学微生物学<br/><small>虚拟仿真实验平台</small></span></Link><div><p className="eyebrow">ADMIN CONSOLE</p><h1>让每一次教学实验<br/>都可复现、可迭代</h1></div><p>安全管理 JSX 实验资产、不可变版本与发布状态。</p></div><main className="login-main"><form className="form-card" onSubmit={submit}><p className="eyebrow">WELCOME BACK</p><h2>管理员登录</h2><p>使用平台管理员账户继续</p><ErrorNotice error={error}/><label>邮箱<input name="email" type="email" autoComplete="username" required placeholder="admin@example.com"/></label><label>密码<input name="password" type="password" autoComplete="current-password" required/></label><button className="button primary" disabled={busy}>{busy ? "登录中…" : "登录"}</button><Link className="back-link" to="/">← 返回学生首页</Link></form></main></div>;
}

function AdminLayout({ children }: { children: ReactNode }) {
  const auth = useContext(AuthContext); const navigate = useNavigate();
  if (auth.loading) return <Loading/>; if (!auth.user) return <Navigate to="/login" replace/>;
  const logout = async () => { await api("/api/auth/logout", { method: "POST" }); await auth.refresh(); navigate("/"); };
  return <div className="admin-shell"><aside><Link className="brand light" to="/dashboard"><span className="brand-mark">μ</span><span>MicroBio Lab<br/><small>实验管理平台</small></span></Link><nav><NavLink to="/dashboard">▦ <span>控制台</span></NavLink><NavLink to="/admin/experiments">▤ <span>实验管理</span></NavLink><NavLink to="/admin/audit">◴ <span>审计日志</span></NavLink></nav><div className="admin-user"><div>{auth.user.email.slice(0, 1).toUpperCase()}</div><span><strong>{auth.user.email}</strong><small>平台管理员</small></span><button title="退出" onClick={logout}>↪</button></div></aside><section className="admin-content">{children}</section></div>;
}

function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) { return <header className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div>{children}</header>; }

function Dashboard() {
  type Data = { counts: { status: string; count: number }[]; buildFailed: number; recent: Experiment[]; logs: { id: string; action: string; email?: string; created_at: string }[] };
  const [data, setData] = useState<Data>(); useEffect(() => { api<Data>("/api/dashboard").then(setData); }, []);
  if (!data) return <Loading/>; const count = (s: string) => data.counts.find((x) => x.status === s)?.count ?? 0;
  return <><PageHeader eyebrow="OVERVIEW" title="控制台"><Link className="button primary" to="/admin/experiments/new">＋ 新建实验</Link></PageHeader><div className="stat-grid"><article><span>实验总数</span><strong>{data.counts.reduce((a, x) => a + x.count, 0)}</strong><small>全部实验资产</small></article><article><span>已发布</span><strong>{count("published")}</strong><small>学生端可访问</small></article><article><span>草稿 / 归档</span><strong>{count("draft")} / {count("archived")}</strong><small>待处理内容</small></article><article className={data.buildFailed ? "warn" : ""}><span>构建失败</span><strong>{data.buildFailed}</strong><small>需要关注</small></article></div><div className="two-columns"><section className="panel"><div className="panel-heading"><h2>最近更新</h2><Link to="/admin/experiments">查看全部</Link></div>{data.recent.length ? <div className="simple-list">{data.recent.map((x) => <Link key={x.id} to={`/admin/experiments/${x.id}`}><span className="list-icon">🧫</span><span><strong>{x.title}</strong><small>{x.slug}</small></span><Status value={x.status}/></Link>)}</div> : <Empty>暂无实验</Empty>}</section><section className="panel"><div className="panel-heading"><h2>最近操作</h2><Link to="/admin/audit">审计日志</Link></div><div className="timeline">{data.logs.map((x) => <div key={x.id}><i/><span><strong>{x.action}</strong><small>{x.email ?? "系统"} · {new Date(x.created_at).toLocaleString("zh-CN")}</small></span></div>)}</div></section></div></>;
}

function Experiments() {
  const [items, setItems] = useState<Experiment[]>(); const [filter, setFilter] = useState("all");
  useEffect(() => { api<{ experiments: Experiment[] }>("/api/experiments").then((x) => setItems(x.experiments)); }, []);
  const shown = useMemo(() => items?.filter((x) => filter === "all" || x.status === filter), [items, filter]);
  return <><PageHeader eyebrow="EXPERIMENTS" title="实验管理"><Link className="button primary" to="/admin/experiments/new">＋ 新建实验</Link></PageHeader><div className="filters">{[["all","全部"],["published","已发布"],["draft","草稿"],["hidden","已隐藏"],["archived","已归档"]].map(([value,label]) => <button className={filter === value ? "active" : ""} onClick={() => setFilter(value!)} key={value}>{label}</button>)}</div>{!shown ? <Loading/> : shown.length === 0 ? <Empty>没有符合条件的实验</Empty> : <div className="table-wrap"><table><thead><tr><th>实验</th><th>分类</th><th>状态</th><th>当前版本</th><th>版本数</th><th>更新时间</th><th/></tr></thead><tbody>{shown.map((x) => <tr key={x.id}><td><strong>{x.title}</strong><small>{x.slug}</small></td><td>{x.category || "—"}</td><td><Status value={x.status}/></td><td>{x.active_version_number ? versionName(x.active_version_number) : "—"}</td><td>{x.version_count}</td><td>{new Date(x.updated_at).toLocaleDateString("zh-CN")}</td><td><Link className="text-link" to={`/admin/experiments/${x.id}`}>管理 →</Link></td></tr>)}</tbody></table></div>}</>;
}

function NewExperiment() {
  const navigate = useNavigate(); const [error, setError] = useState<unknown>(); const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setBusy(true); setError(undefined); try { const result = await api<{ experimentId: string }>("/api/experiments", { method: "POST", body: new FormData(event.currentTarget) }); navigate(`/admin/experiments/${result.experimentId}`); } catch (e) { setError(e); setBusy(false); } };
  return <><PageHeader eyebrow="NEW EXPERIMENT" title="新建实验"><Link className="button ghost" to="/admin/experiments">取消</Link></PageHeader><form className="edit-form panel" onSubmit={submit}><ErrorNotice error={error}/><div className="form-grid"><label>实验名称 *<input name="title" required maxLength={200} placeholder="例如：肠道杆菌的分离培养与生化鉴定"/></label><label>Slug *<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="enterobacteria-identification"/><small>首次发布后不可修改</small></label><label>分类<input name="category" maxLength={100} placeholder="肠道杆菌"/></label><label>封面（可选）<input name="cover" type="file" accept="image/png,image/jpeg,image/webp"/><small>PNG、JPEG 或 WebP，最大 2 MiB</small></label><label className="wide">简介<textarea name="description" rows={5} maxLength={4000} placeholder="说明实验目标与教学内容"/></label><label className="wide file-field">JSX 实验文件 *<input name="jsx" type="file" accept=".jsx,text/jsx" required/><span>仅限单个 UTF-8 `.jsx` 文件，最大 2 MiB</span></label></div><div className="form-actions"><button className="button primary" disabled={busy}>{busy ? "上传并创建中…" : "创建实验并开始构建"}</button></div></form></>;
}

function ExperimentDetail() {
  const { id } = useParams(); const [item, setItem] = useState<Experiment>(); const [versions, setVersions] = useState<Version[]>([]); const [error, setError] = useState<unknown>(); const [preview, setPreview] = useState<Version>();
  const load = async () => { const [a,b] = await Promise.all([api<{ experiment: Experiment }>(`/api/experiments/${id}`), api<{ versions: Version[] }>(`/api/experiments/${id}/versions`)]); setItem(a.experiment); setVersions(b.versions); };
  useEffect(() => { void load().catch(setError); }, [id]);
  useEffect(() => { if (!versions.some((v) => ["queued","running","building"].includes(v.status) || ["queued","running"].includes(v.job_status))) return; const timer = setInterval(() => void load(), 1800); return () => clearInterval(timer); }, [versions]);
  const action = async (url: string) => { setError(undefined); try { await api(url, { method: "POST" }); await load(); } catch (e) { setError(e); } };
  const upload = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); try { await api(`/api/experiments/${id}/versions`, { method: "POST", body: new FormData(event.currentTarget) }); event.currentTarget.reset(); await load(); } catch (e) { setError(e); } };
  if (!item) return error ? <ErrorNotice error={error}/> : <Loading/>;
  return <><PageHeader eyebrow="EXPERIMENT DETAIL" title={item.title}><Link className="button ghost" to="/admin/experiments">← 返回列表</Link></PageHeader><ErrorNotice error={error}/><div className="detail-summary panel"><div><span>Slug</span><strong>{item.slug}</strong></div><div><span>分类</span><strong>{item.category || "未分类"}</strong></div><div><span>状态</span><Status value={item.status}/></div><div className="detail-actions">{item.status === "archived" ? <button onClick={() => action(`/api/experiments/${id}/restore`)}>恢复</button> : <><button onClick={() => action(`/api/experiments/${id}/hide`)}>下架</button><button onClick={() => action(`/api/experiments/${id}/archive`)}>归档</button></>}</div></div><section className="panel"><div className="panel-heading"><div><h2>版本历史</h2><p>每个版本发布后保持不可变，可随时切换生效版本。</p></div><form className="inline-upload" onSubmit={upload}><input name="jsx" type="file" accept=".jsx" required/><button className="button primary">上传新版</button></form></div>{versions.length === 0 ? <Empty>暂无版本</Empty> : <div className="version-list">{versions.map((v) => <article key={v.id} className={item.active_version_id === v.id ? "active-version" : ""}><div className="version-head"><div><strong>{versionName(v.version_number)}</strong>{item.active_version_id === v.id && <span className="current">当前</span>}</div><Status value={v.status}/></div><dl><div><dt>Source SHA256</dt><dd>{v.source_sha256}</dd></div><div><dt>Builder</dt><dd>{v.builder_version ?? "等待构建"}</dd></div><div><dt>Imports</dt><dd>{v.build_imports?.join(", ") || "—"}</dd></div></dl>{v.build_warnings?.map((w) => <p className="warning" key={w}>⚠ {w}</p>)}{v.error_message && <div className="notice error"><strong>{v.error_code}</strong><span>{v.error_message}</span></div>}<div className="version-actions">{v.status === "success" && <><button onClick={() => setPreview(v)}>预览</button><button className="primary-small" onClick={() => action(`/api/versions/${v.id}/publish`)}>{item.active_version_id ? "发布 / 回滚至此版本" : "发布"}</button></>}</div></article>)}</div>}</section>{preview && <div className="modal"><div className="modal-card"><header><strong>预览 {versionName(preview.version_number)}</strong><button onClick={() => setPreview(undefined)}>×</button></header><iframe title="管理员预览" src={`/preview/${preview.id}/index.html`} sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer"/></div></div>}</>;
}

function Audit() {
  const [logs, setLogs] = useState<{ id: string; action: string; entity_type: string; entity_id?: string; email?: string; metadata: object; created_at: string }[]>();
  useEffect(() => { api<{ logs: typeof logs }>("/api/admin/audit?limit=200").then((x) => setLogs(x.logs)); }, []);
  return <><PageHeader eyebrow="SECURITY & TRACEABILITY" title="审计日志"/>{!logs ? <Loading/> : <div className="table-wrap"><table><thead><tr><th>时间</th><th>操作人</th><th>动作</th><th>对象</th><th>对象 ID</th></tr></thead><tbody>{logs.map((x) => <tr key={x.id}><td>{new Date(x.created_at).toLocaleString("zh-CN")}</td><td>{x.email ?? "系统"}</td><td><code>{x.action}</code></td><td>{x.entity_type}</td><td className="mono">{x.entity_id ?? "—"}</td></tr>)}</tbody></table></div>}</>;
}

function App() { return <AuthProvider><Routes><Route path="/" element={<PublicHome/>}/><Route path="/experiments/:slug" element={<PublicExperimentPage/>}/><Route path="/login" element={<Login/>}/><Route path="/dashboard" element={<AdminLayout><Dashboard/></AdminLayout>}/><Route path="/admin/experiments" element={<AdminLayout><Experiments/></AdminLayout>}/><Route path="/admin/experiments/new" element={<AdminLayout><NewExperiment/></AdminLayout>}/><Route path="/admin/experiments/:id" element={<AdminLayout><ExperimentDetail/></AdminLayout>}/><Route path="/admin/experiments/:id/versions" element={<AdminLayout><ExperimentDetail/></AdminLayout>}/><Route path="/admin/audit" element={<AdminLayout><Audit/></AdminLayout>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes></AuthProvider>; }
export default App;
