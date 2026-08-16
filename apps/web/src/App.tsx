import { createContext, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, NavLink, Route, Routes, useNavigate, useParams } from "react-router-dom";
import QRCode from "qrcode";
import { COVER_MAX_UPLOAD_BYTES, JSX_MAX_UPLOAD_BYTES } from "@microbio/shared";
import { api, ApiClientError } from "./api";

type User = { id: string; email: string; role: "ADMIN" };
type Experiment = {
  id: string; slug: string; slug_locked: boolean; title: string; description: string; category: string;
  cover_path?: string; status: string; display_order: number; active_version_id?: string;
  active_version_number?: number; version_count?: number; updated_at: string;
};
type Version = {
  id: string; version_number: number; status: string; job_status: string; source_sha256: string;
  builder_version?: string; build_warnings: string[]; build_imports: string[]; error_code?: string;
  error_message?: string; built_at?: string; published_at?: string;
};
type PublicExperiment = {
  slug: string; title: string; description: string; category: string; cover_path?: string;
  version: string; iframeUrl: string; updated_at: string;
};

const statusNames: Record<string, string> = { draft: "草稿", queued: "排队中", running: "构建中", building: "构建中", success: "构建成功", failed: "构建失败", published: "已发布", hidden: "已下架", archived: "已归档" };
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

function uploadFile(form: HTMLFormElement, name: string, label: string, maxBytes: number, maxSizeLabel: string, required = false): File | undefined {
  const input = form.elements.namedItem(name) as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (!file && required) throw new ApiClientError("UPLOAD_INVALID", `请选择${label}`, 400);
  if (file && file.size > maxBytes) throw new ApiClientError("UPLOAD_TOO_LARGE", `${label}不能超过 ${maxSizeLabel}`, 413);
  return file;
}

function themeIndex(slug: string): number {
  return [...slug].reduce((value, char) => ((value * 31) + char.charCodeAt(0)) >>> 0, 7) % 8;
}

function ExperimentCover({ experiment, large = false }: { experiment: Pick<PublicExperiment, "slug" | "title" | "category" | "cover_path">; large?: boolean }) {
  const className = `experiment-cover theme-${themeIndex(experiment.slug)}${large ? " large" : ""}`;
  if (experiment.cover_path) return <div className={className}><img src={`/covers/${encodeURIComponent(experiment.cover_path)}`} alt={`${experiment.title}封面`} /></div>;
  return <div className={`${className} generated-cover`}><span className="cover-orbit" /><span className="cover-symbol">μ</span><small>{experiment.category || "虚拟仿真实验"}</small></div>;
}

function QrPanel({ value }: { value: string }) {
  const [dataUrl, setDataUrl] = useState<string>();
  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(value, { width: 260, margin: 1, errorCorrectionLevel: "M", color: { dark: "#0a3b35", light: "#ffffff" } }).then((url) => { if (active) setDataUrl(url); });
    return () => { active = false; };
  }, [value]);
  return <aside className="qr-panel"><div>{dataUrl ? <img src={dataUrl} alt="实验二维码" /> : <Loading />}</div><strong>手机扫码开始实验</strong><p>二维码始终指向当前发布版本</p></aside>;
}

const AuthContext = createContext<{ user: User | null; loading: boolean; refresh: () => Promise<void> }>({ user: null, loading: true, refresh: async () => undefined });
function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = async () => { try { const data = await api<{ user: User | null }>("/api/auth/me"); setUser(data.user); } finally { setLoading(false); } };
  useEffect(() => { void refresh(); }, []);
  return <AuthContext.Provider value={{ user, loading, refresh }}>{children}</AuthContext.Provider>;
}

function PublicHeader() {
  return <header className="public-header"><Link className="brand" to="/"><span className="brand-mark">μ</span><span>医学微生物学<br /><small>虚拟仿真实验平台</small></span></Link><Link className="button ghost" to="/login">管理员登录</Link></header>;
}

function PublicHome() {
  const [items, setItems] = useState<PublicExperiment[] | null>(null);
  const [error, setError] = useState<unknown>();
  useEffect(() => { api<{ experiments: PublicExperiment[] }>("/api/public/experiments").then((x) => setItems(x.experiments)).catch(setError); }, []);
  return <div className="public-page">
    <PublicHeader />
    <section className="hero"><div><p className="eyebrow">MICROBIOLOGY VIRTUAL LAB</p><h1>在安全、可复现的环境中<br />探索微观世界</h1><p>按照教学顺序学习医学微生物学交互式虚拟实验。</p></div><div className="hero-art"><span>🧫</span><span>🔬</span><span>🧬</span></div></section>
    <main className="public-main"><div className="section-heading"><div><p className="eyebrow">EXPERIMENTS</p><h2>实验资源</h2></div><span>{items?.length ?? 0} 个已发布实验</span></div><ErrorNotice error={error} />
      {!items ? <Loading /> : items.length === 0 ? <Empty>暂时没有已发布实验</Empty> : <div className="cards">{items.map((item, index) => <article className="experiment-card" key={item.slug}><ExperimentCover experiment={item} /><div className="card-body"><div className="card-meta"><span>实验 {String(index + 1).padStart(2, "0")} · {item.category || "未分类"}</span><span>{item.version}</span></div><h3>{item.title}</h3><p>{item.description || "进入介绍页了解实验内容与学习目标。"}</p><Link className="text-link" to={`/experiments/${item.slug}`}>查看实验介绍 <span>→</span></Link></div></article>)}</div>}
    </main><footer>医学微生物学虚拟仿真实验平台</footer>
  </div>;
}

function usePublicExperiment(slug: string | undefined) {
  const [item, setItem] = useState<PublicExperiment>();
  const [error, setError] = useState<unknown>();
  useEffect(() => { if (slug) api<{ experiment: PublicExperiment }>(`/api/public/experiments/${slug}`).then((x) => setItem(x.experiment)).catch(setError); }, [slug]);
  return { item, error };
}

function PublicExperimentPage() {
  const { slug } = useParams();
  const { item, error } = usePublicExperiment(slug);
  if (error) return <main className="center-panel"><ErrorNotice error={error} /><Link to="/">返回首页</Link></main>;
  if (!item) return <Loading />;
  const runPath = `/experiments/${item.slug}/run`;
  const runUrl = `${window.location.origin}${runPath}`;
  return <div className="public-page"><PublicHeader /><main className="experiment-intro"><section className="intro-hero"><ExperimentCover experiment={item} large /><div className="intro-copy"><p className="eyebrow">VIRTUAL EXPERIMENT · {item.category || "未分类"}</p><h1>{item.title}</h1><div className="intro-meta"><span>{item.version}</span><span>更新于 {new Date(item.updated_at).toLocaleDateString("zh-CN")}</span></div><Link className="button primary launch-button" to={runPath}>开始虚拟实验 <span>→</span></Link></div></section><section className="intro-content"><article><p className="eyebrow">ABOUT THIS LAB</p><h2>实验简介</h2><div className="long-description">{item.description || "暂无实验简介。"}</div><div className="intro-actions"><Link className="button primary" to={runPath}>进入正式实验</Link><button className="button" onClick={() => void navigator.clipboard.writeText(runUrl)}>复制实验地址</button><Link className="button ghost" to="/">返回实验列表</Link></div></article><QrPanel value={runUrl} /></section></main><footer>医学微生物学虚拟仿真实验平台</footer></div>;
}

function PublicRunPage() {
  const { slug } = useParams();
  const { item, error } = usePublicExperiment(slug);
  if (error) return <main className="center-panel"><ErrorNotice error={error} /><Link to={`/experiments/${slug}`}>返回实验介绍</Link></main>;
  if (!item) return <Loading />;
  return <div className="lab-shell"><header><Link to={`/experiments/${item.slug}`}>← 返回实验介绍</Link><div><strong>{item.title}</strong><span>{item.version}</span></div></header><iframe title={item.title} src={item.iframeUrl} sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer" /></div>;
}

function Login() {
  const auth = useContext(AuthContext); const navigate = useNavigate(); const [error, setError] = useState<unknown>(); const [busy, setBusy] = useState(false);
  if (auth.user) return <Navigate to="/dashboard" replace />;
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setBusy(true); setError(undefined); const data = new FormData(event.currentTarget); try { await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: data.get("email"), password: data.get("password") }) }); await auth.refresh(); navigate("/dashboard"); } catch (e) { setError(e); } finally { setBusy(false); } };
  return <div className="login-page"><div className="login-aside"><Link className="brand light" to="/"><span className="brand-mark">μ</span><span>医学微生物学<br /><small>虚拟仿真实验平台</small></span></Link><div><p className="eyebrow">ADMIN CONSOLE</p><h1>让每一次教学实验<br />都可复现、可迭代</h1></div><p>安全管理 JSX 实验资产、不可变版本与发布状态。</p></div><main className="login-main"><form className="form-card" onSubmit={submit}><p className="eyebrow">WELCOME BACK</p><h2>管理员登录</h2><p>使用平台管理员账户继续</p><ErrorNotice error={error} /><label>邮箱<input name="email" type="email" autoComplete="username" required placeholder="admin@example.com" /></label><label>密码<input name="password" type="password" autoComplete="current-password" required /></label><button className="button primary" disabled={busy}>{busy ? "登录中…" : "登录"}</button><Link className="back-link" to="/">← 返回学生首页</Link></form></main></div>;
}

function AdminLayout({ children }: { children: ReactNode }) {
  const auth = useContext(AuthContext); const navigate = useNavigate();
  if (auth.loading) return <Loading />; if (!auth.user) return <Navigate to="/login" replace />;
  const logout = async () => { await api("/api/auth/logout", { method: "POST" }); await auth.refresh(); navigate("/"); };
  return <div className="admin-shell"><aside><Link className="brand light" to="/dashboard"><span className="brand-mark">μ</span><span>MicroBio Lab<br /><small>实验管理平台</small></span></Link><nav><NavLink to="/dashboard">▦ <span>控制台</span></NavLink><NavLink to="/admin/experiments">▤ <span>实验管理</span></NavLink><NavLink to="/admin/audit">◴ <span>审计日志</span></NavLink></nav><div className="admin-user"><div>{auth.user.email.slice(0, 1).toUpperCase()}</div><span><strong>{auth.user.email}</strong><small>平台管理员</small></span><button title="退出" onClick={logout}>↪</button></div></aside><section className="admin-content">{children}</section></div>;
}

function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) { return <header className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div>{children}</header>; }

function Dashboard() {
  type Data = { counts: { status: string; count: number }[]; buildFailed: number; recent: Experiment[]; logs: { id: string; action: string; email?: string; created_at: string }[] };
  const [data, setData] = useState<Data>(); useEffect(() => { api<Data>("/api/dashboard").then(setData); }, []);
  if (!data) return <Loading />; const count = (status: string) => data.counts.find((item) => item.status === status)?.count ?? 0;
  return <><PageHeader eyebrow="OVERVIEW" title="控制台"><Link className="button primary" to="/admin/experiments/new">＋ 新建实验</Link></PageHeader><div className="stat-grid"><article><span>实验总数</span><strong>{data.counts.reduce((sum, item) => sum + item.count, 0)}</strong><small>全部实验资产</small></article><article><span>已发布</span><strong>{count("published")}</strong><small>学生端可访问</small></article><article><span>草稿 / 归档</span><strong>{count("draft")} / {count("archived")}</strong><small>待处理内容</small></article><article className={data.buildFailed ? "warn" : ""}><span>构建失败</span><strong>{data.buildFailed}</strong><small>需要关注</small></article></div><div className="two-columns"><section className="panel"><div className="panel-heading"><h2>最近更新</h2><Link to="/admin/experiments">查看全部</Link></div>{data.recent.length ? <div className="simple-list">{data.recent.map((item) => <Link key={item.id} to={`/admin/experiments/${item.id}`}><span className="list-icon">🧫</span><span><strong>{item.title}</strong><small>{item.slug}</small></span><Status value={item.status} /></Link>)}</div> : <Empty>暂无实验</Empty>}</section><section className="panel"><div className="panel-heading"><h2>最近操作</h2><Link to="/admin/audit">审计日志</Link></div><div className="timeline">{data.logs.map((item) => <div key={item.id}><i /><span><strong>{item.action}</strong><small>{item.email ?? "系统"} · {new Date(item.created_at).toLocaleString("zh-CN")}</small></span></div>)}</div></section></div></>;
}

function Experiments() {
  const [items, setItems] = useState<Experiment[]>(); const [filter, setFilter] = useState("all"); const [dirty, setDirty] = useState(false); const [saving, setSaving] = useState(false); const [error, setError] = useState<unknown>();
  useEffect(() => { api<{ experiments: Experiment[] }>("/api/experiments").then((result) => setItems(result.experiments)).catch(setError); }, []);
  const shown = useMemo(() => items?.filter((item) => filter === "all" || item.status === filter), [items, filter]);
  const move = (id: string, offset: number) => { if (!items) return; const index = items.findIndex((item) => item.id === id); const target = index + offset; if (index < 0 || target < 0 || target >= items.length) return; const next = [...items]; const [moved] = next.splice(index, 1); if (!moved) return; next.splice(target, 0, moved); setItems(next); setDirty(true); };
  const saveOrder = async () => { if (!items) return; setSaving(true); setError(undefined); try { await api("/api/experiments/order", { method: "PUT", body: JSON.stringify({ experimentIds: items.map((item) => item.id) }) }); setDirty(false); } catch (reason) { setError(reason); } finally { setSaving(false); } };
  return <><PageHeader eyebrow="EXPERIMENTS" title="实验管理"><div className="header-actions"><button className="button" disabled={!dirty || saving || filter !== "all"} onClick={() => void saveOrder()}>{saving ? "保存中…" : "保存教学顺序"}</button><Link className="button primary" to="/admin/experiments/new">＋ 新建实验</Link></div></PageHeader><ErrorNotice error={error} /><div className="order-tip">在“全部”列表中使用上下按钮排列教学顺序；学生首页按此顺序展示已发布实验。</div><div className="filters">{[["all", "全部"], ["published", "已发布"], ["draft", "草稿"], ["hidden", "已下架"], ["archived", "已归档"]].map(([value, label]) => <button className={filter === value ? "active" : ""} onClick={() => setFilter(value!)} key={value}>{label}</button>)}</div>{!shown ? <Loading /> : shown.length === 0 ? <Empty>没有符合条件的实验</Empty> : <div className="table-wrap"><table><thead><tr><th>教学顺序</th><th>实验</th><th>分类</th><th>状态</th><th>当前版本</th><th>版本数</th><th>更新时间</th><th /></tr></thead><tbody>{shown.map((item) => { const index = items?.findIndex((candidate) => candidate.id === item.id) ?? -1; return <tr key={item.id}><td><div className="order-controls"><strong>{index + 1}</strong><button disabled={filter !== "all" || index <= 0} title={`上移 ${item.title}`} onClick={() => move(item.id, -1)}>↑</button><button disabled={filter !== "all" || !items || index >= items.length - 1} title={`下移 ${item.title}`} onClick={() => move(item.id, 1)}>↓</button></div></td><td><strong>{item.title}</strong><small>{item.slug}</small></td><td>{item.category || "—"}</td><td><Status value={item.status} /></td><td>{item.active_version_number ? versionName(item.active_version_number) : "—"}</td><td>{item.version_count}</td><td>{new Date(item.updated_at).toLocaleDateString("zh-CN")}</td><td><Link className="text-link" to={`/admin/experiments/${item.id}`}>管理 →</Link></td></tr>; })}</tbody></table></div>}</>;
}

function NewExperiment() {
  const navigate = useNavigate(); const [error, setError] = useState<unknown>(); const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; setBusy(true); setError(undefined); try { uploadFile(form, "jsx", "JSX 文件", JSX_MAX_UPLOAD_BYTES, "10 MiB", true); const cover = uploadFile(form, "cover", "封面图片", COVER_MAX_UPLOAD_BYTES, "2 MiB"); const body = new FormData(form); if (!cover) body.delete("cover"); const result = await api<{ experimentId: string }>("/api/experiments", { method: "POST", body }); navigate(`/admin/experiments/${result.experimentId}`); } catch (reason) { setError(reason); setBusy(false); } };
  return <><PageHeader eyebrow="NEW EXPERIMENT" title="新建实验"><Link className="button ghost" to="/admin/experiments">取消</Link></PageHeader><form className="edit-form panel" onSubmit={submit}><ErrorNotice error={error} /><div className="form-grid"><label>实验名称 *<input name="title" required maxLength={200} placeholder="例如：肠道杆菌的分离培养与生化鉴定" /></label><label>Slug *<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="enterobacteria-identification" /><small>首次发布后不可修改</small></label><label>分类<input name="category" maxLength={100} placeholder="肠道杆菌" /></label><label>封面（可选）<input name="cover" type="file" accept="image/png,image/jpeg,image/webp" /><small>可留空，系统自动生成主题色块；最大 2 MiB</small></label><label className="wide">简介<textarea name="description" rows={7} maxLength={4000} placeholder="说明实验目标、主要内容、适用对象和学习要求" /></label><label className="wide file-field">JSX 实验文件 *<input name="jsx" type="file" accept=".jsx,text/jsx" required /><span>仅限单个 UTF-8 `.jsx` 文件，最大 10 MiB</span></label></div><div className="form-actions"><button className="button primary" disabled={busy}>{busy ? "上传并创建中…" : "创建实验并开始构建"}</button></div></form></>;
}

function ExperimentDetail() {
  const { id } = useParams(); const navigate = useNavigate(); const [item, setItem] = useState<Experiment>(); const [versions, setVersions] = useState<Version[]>([]); const [error, setError] = useState<unknown>(); const [preview, setPreview] = useState<Version>(); const [deleteSlug, setDeleteSlug] = useState("");
  const load = async () => { const [experiment, history] = await Promise.all([api<{ experiment: Experiment }>(`/api/experiments/${id}`), api<{ versions: Version[] }>(`/api/experiments/${id}/versions`)]); setItem(experiment.experiment); setVersions(history.versions); };
  useEffect(() => { void load().catch(setError); }, [id]);
  useEffect(() => { if (!versions.some((version) => ["queued", "running", "building"].includes(version.status) || ["queued", "running"].includes(version.job_status))) return; const timer = setInterval(() => void load(), 1800); return () => clearInterval(timer); }, [versions]);
  const action = async (url: string, method = "POST") => { setError(undefined); try { await api(url, { method }); await load(); } catch (reason) { setError(reason); } };
  const updateInfo = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); setError(undefined); try { await api(`/api/experiments/${id}`, { method: "PATCH", body: JSON.stringify({ title: data.get("title"), slug: data.get("slug"), category: data.get("category"), description: data.get("description") }) }); await load(); } catch (reason) { setError(reason); } };
  const upload = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; setError(undefined); try { uploadFile(form, "jsx", "JSX 文件", JSX_MAX_UPLOAD_BYTES, "10 MiB", true); await api(`/api/experiments/${id}/versions`, { method: "POST", body: new FormData(form) }); form.reset(); await load(); } catch (reason) { setError(reason); } };
  const updateCover = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; setError(undefined); try { uploadFile(form, "cover", "封面图片", COVER_MAX_UPLOAD_BYTES, "2 MiB", true); await api(`/api/experiments/${id}/cover`, { method: "POST", body: new FormData(form) }); form.reset(); await load(); } catch (reason) { setError(reason); } };
  const removeVersion = async (version: Version) => { if (!window.confirm(`确定删除未发布的 ${versionName(version.version_number)} 吗？`)) return; await action(`/api/versions/${version.id}`, "DELETE"); };
  const removeExperiment = async () => { if (!item || deleteSlug !== item.slug || !window.confirm("永久删除后，源码、构建、发布文件和数据库记录均无法恢复。确定继续吗？")) return; setError(undefined); try { await api(`/api/experiments/${id}`, { method: "DELETE", body: JSON.stringify({ slug: deleteSlug }) }); navigate("/admin/experiments"); } catch (reason) { setError(reason); } };
  if (!item) return error ? <ErrorNotice error={error} /> : <Loading />;
  const publicPath = `/experiments/${item.slug}`;
  return <><PageHeader eyebrow="EXPERIMENT DETAIL" title={item.title}><div className="header-actions">{item.status === "published" && <><Link className="button" to={publicPath} target="_blank">打开介绍页</Link><Link className="button" to={`${publicPath}/run`} target="_blank">打开正式实验</Link></>}<Link className="button ghost" to="/admin/experiments">← 返回列表</Link></div></PageHeader><ErrorNotice error={error} />
    <div className="detail-summary panel"><div><span>Slug</span><strong>{item.slug}</strong></div><div><span>分类</span><strong>{item.category || "未分类"}</strong></div><div><span>状态</span><Status value={item.status} /></div><div className="detail-actions">{item.status === "published" && <button onClick={() => void action(`/api/experiments/${id}/hide`)}>下架</button>}{item.status === "hidden" && <button onClick={() => void action(`/api/experiments/${id}/restore`)}>恢复为草稿</button>}{item.status === "archived" ? <button onClick={() => void action(`/api/experiments/${id}/restore`)}>恢复为草稿</button> : <button onClick={() => void action(`/api/experiments/${id}/archive`)}>归档</button>}</div></div>
    <div className="admin-detail-grid"><form className="panel edit-form compact-form" onSubmit={updateInfo}><div className="panel-heading"><div><h2>基本信息与介绍页</h2><p>修改后将同步到学生首页和实验介绍页。</p></div></div><div className="form-grid"><label>实验名称<input name="title" required maxLength={200} defaultValue={item.title} /></label><label>Slug<input name="slug" required disabled={item.slug_locked} defaultValue={item.slug} />{item.slug_locked && <small>首次发布后不可修改</small>}</label><label>分类<input name="category" maxLength={100} defaultValue={item.category} /></label><label className="wide">实验简介<textarea name="description" rows={8} maxLength={4000} defaultValue={item.description} /></label></div><div className="form-actions"><button className="button primary">保存基本信息</button></div></form>
      <section className="panel cover-manager"><div className="panel-heading"><div><h2>实验封面</h2><p>不设置图片时自动使用固定主题色块。</p></div></div><ExperimentCover experiment={item} /><form onSubmit={updateCover}><input name="cover" type="file" accept="image/png,image/jpeg,image/webp" required /><button className="button">更换封面</button></form>{item.cover_path && <button className="text-danger" onClick={() => void action(`/api/experiments/${id}/cover`, "DELETE")}>删除图片并使用自动背景</button>}</section></div>
    <section className="panel"><div className="panel-heading"><div><h2>版本历史</h2><p>每个版本发布后保持不可变，可随时切换生效版本。</p></div><form className="inline-upload" onSubmit={upload}><input name="jsx" type="file" accept=".jsx" required /><button className="button primary">上传新版</button></form></div>{versions.length === 0 ? <Empty>暂无版本</Empty> : <div className="version-list">{versions.map((version) => { const canDelete = !version.published_at && item.active_version_id !== version.id && !["queued", "building", "running"].includes(version.status) && !["queued", "running"].includes(version.job_status); return <article key={version.id} className={item.active_version_id === version.id ? "active-version" : ""}><div className="version-head"><div><strong>{versionName(version.version_number)}</strong>{item.active_version_id === version.id && <span className="current">当前</span>}{version.published_at && <span className="published-once">已发布记录</span>}</div><Status value={version.status} /></div><dl><div><dt>Source SHA256</dt><dd>{version.source_sha256}</dd></div><div><dt>Builder</dt><dd>{version.builder_version ?? "等待构建"}</dd></div><div><dt>Imports</dt><dd>{version.build_imports?.join(", ") || "—"}</dd></div></dl>{version.build_warnings?.map((warning) => <p className="warning" key={warning}>⚠ {warning}</p>)}{version.error_message && <div className="notice error"><strong>{version.error_code}</strong><span>{version.error_message}</span></div>}<div className="version-actions">{canDelete && <button className="text-danger" onClick={() => void removeVersion(version)}>删除未发布版本</button>}{version.status === "success" && <><button onClick={() => setPreview(version)}>预览</button><button className="primary-small" onClick={() => void action(`/api/versions/${version.id}/publish`)}>{item.active_version_id ? "发布 / 回滚至此版本" : "发布"}</button></>}</div></article>; })}</div>}</section>
    {item.status === "archived" && <section className="panel danger-zone"><div><p className="eyebrow">DANGER ZONE</p><h2>永久删除实验及全部文件</h2><p>将同时删除所有 JSX 源码、构建产物、发布目录、封面和数据库记录，此操作不可恢复。</p></div><div><label>输入 Slug <code>{item.slug}</code> 确认<input value={deleteSlug} onChange={(event) => setDeleteSlug(event.target.value)} /></label><button disabled={deleteSlug !== item.slug} onClick={() => void removeExperiment()}>永久删除</button></div></section>}
    {preview && <div className="modal"><div className="modal-card"><header><strong>预览 {versionName(preview.version_number)}</strong><button onClick={() => setPreview(undefined)}>×</button></header><iframe title="管理员预览" src={`/preview/${preview.id}/index.html`} sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer" /></div></div>}</>;
}

function Audit() {
  const [logs, setLogs] = useState<{ id: string; action: string; entity_type: string; entity_id?: string; email?: string; metadata: object; created_at: string }[]>();
  useEffect(() => { api<{ logs: typeof logs }>("/api/admin/audit?limit=200").then((result) => setLogs(result.logs)); }, []);
  return <><PageHeader eyebrow="SECURITY & TRACEABILITY" title="审计日志" />{!logs ? <Loading /> : <div className="table-wrap"><table><thead><tr><th>时间</th><th>操作人</th><th>动作</th><th>对象</th><th>对象 ID</th></tr></thead><tbody>{logs.map((item) => <tr key={item.id}><td>{new Date(item.created_at).toLocaleString("zh-CN")}</td><td>{item.email ?? "系统"}</td><td><code>{item.action}</code></td><td>{item.entity_type}</td><td className="mono">{item.entity_id ?? "—"}</td></tr>)}</tbody></table></div>}</>;
}

function App() {
  return <AuthProvider><Routes><Route path="/" element={<PublicHome />} /><Route path="/experiments/:slug" element={<PublicExperimentPage />} /><Route path="/experiments/:slug/run" element={<PublicRunPage />} /><Route path="/login" element={<Login />} /><Route path="/dashboard" element={<AdminLayout><Dashboard /></AdminLayout>} /><Route path="/admin/experiments" element={<AdminLayout><Experiments /></AdminLayout>} /><Route path="/admin/experiments/new" element={<AdminLayout><NewExperiment /></AdminLayout>} /><Route path="/admin/experiments/:id" element={<AdminLayout><ExperimentDetail /></AdminLayout>} /><Route path="/admin/experiments/:id/versions" element={<AdminLayout><ExperimentDetail /></AdminLayout>} /><Route path="/admin/audit" element={<AdminLayout><Audit /></AdminLayout>} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></AuthProvider>;
}

export default App;
