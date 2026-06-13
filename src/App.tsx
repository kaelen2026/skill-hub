import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  Search,
  RotateCw,
  Layers,
  GitCompare,
  TriangleAlert,
  Share2,
  FolderOpen,
  ExternalLink,
  SquarePen,
  Power,
  PowerOff,
  ArrowUpFromLine,
  Link2Off,
  ArrowLeftRight,
} from "lucide-react";
import {
  scanSkills,
  revealInFinder,
  openPath,
  previewOp,
  applyOp,
  readSkillMd,
  previewSync,
  applySync,
} from "./api";
import {
  SCOPE_LABELS,
  type ScanResult,
  type SkillGroup,
  type SkillInstance,
  type OpRequest,
  type OpPreview,
  type Tool,
  type SyncRequest,
  type SyncPreview,
} from "./types";
import { ToolTag } from "./ui";
import type { Editing } from "./Editor";
import "./App.css";

// CodeMirror lives behind this lazy boundary so it stays out of the launch bundle.
const Editor = lazy(() => import("./Editor"));

type Filter = "all" | "drift" | "broken" | "shared";

interface Pending {
  op: OpRequest;
  preview: OpPreview;
}
interface Syncing {
  req: SyncRequest;
  preview: SyncPreview;
}

function App() {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [syncing, setSyncing] = useState<Syncing | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);

  async function rescan() {
    setLoading(true);
    setError(null);
    try {
      setResult(await scanSkills());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    rescan();
  }, []);

  async function requestOp(op: OpRequest) {
    try {
      setPending({ op, preview: await previewOp(op) });
    } catch (e) {
      setError(String(e));
    }
  }

  async function openEditor(inst: SkillInstance) {
    try {
      setEditing({ inst, file: await readSkillMd(inst.path) });
    } catch (e) {
      setError(String(e));
    }
  }

  function onSaved(backupPath: string | null) {
    setToast(backupPath ? `已保存 · 备份于 ${backupPath}` : "已保存");
    setEditing(null);
    rescan();
  }

  async function requestSync(inst: SkillInstance, targetTool: Tool) {
    try {
      const req: SyncRequest = { source: inst.path, target_tool: targetTool };
      setSyncing({ req, preview: await previewSync(req) });
    } catch (e) {
      setError(String(e));
    }
  }

  async function confirmSync() {
    if (!syncing) return;
    setSyncBusy(true);
    try {
      const res = await applySync(syncing.req);
      if (res.ok) {
        setToast(
          res.backup_path
            ? `已同步 ${res.written.length} 个文件 · 备份于 ${res.backup_path}`
            : `已同步 ${res.written.length} 个文件`,
        );
        setSyncing(null);
        await rescan();
      } else {
        setError(res.error ?? "同步失败");
        setSyncing(null);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSyncBusy(false);
    }
  }

  async function confirmOp() {
    if (!pending) return;
    setBusy(true);
    try {
      const res = await applyOp(pending.op);
      if (res.ok) {
        setToast(res.backup_path ? `已完成 · 备份于 ${res.backup_path}` : "已完成");
        setPending(null);
        await rescan();
      } else {
        setError(res.error ?? "操作失败");
        setPending(null);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const groups = result?.groups ?? [];

  const counts = useMemo(
    () => ({
      total: groups.length,
      drift: groups.filter((g) => g.drift).length,
      broken: groups.filter((g) => g.has_broken).length,
      shared: groups.filter((g) => g.shared).length,
    }),
    [groups],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups.filter((g) => {
      if (filter === "drift" && !g.drift) return false;
      if (filter === "broken" && !g.has_broken) return false;
      if (filter === "shared" && !g.shared) return false;
      if (!q) return true;
      const hay = [
        g.name,
        ...g.instances.map((i) => i.description ?? ""),
        ...g.instances.map((i) => i.when_to_use ?? ""),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [groups, query, filter]);

  const selectedGroup = useMemo(
    () => groups.find((g) => g.name === selected) ?? null,
    [groups, selected],
  );

  // Keyboard nav: arrow keys move selection through the visible list, like a TUI.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (pending || editing || syncing) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      if (visible.length === 0) return;
      e.preventDefault();
      const idx = visible.findIndex((g) => g.name === selected);
      const next =
        e.key === "ArrowDown"
          ? Math.min(visible.length - 1, idx + 1)
          : Math.max(0, idx < 0 ? 0 : idx - 1);
      setSelected(visible[next]?.name ?? null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, selected, pending, editing, syncing]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg text-ink">
      {/* ---- command bar ---- */}
      <header className="flex h-11 flex-shrink-0 items-center gap-3 border-b border-line bg-rail px-3.5">
        <div className="flex items-center gap-2 pr-1">
          <span className="text-[15px] leading-none text-accent">◆</span>
          <span className="text-[13px] font-semibold tracking-tight">skill-hub</span>
        </div>
        <div className="relative ml-auto flex max-w-[440px] flex-1 items-center">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 text-faint"
            strokeWidth={1.75}
          />
          <input
            className="field w-full py-1.5 pl-8 pr-2.5"
            placeholder="搜索 skill / 描述 / 触发词…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button
          className="icon-btn"
          onClick={rescan}
          disabled={loading}
          title="重新扫描"
          aria-label="重新扫描"
        >
          <RotateCw size={15} strokeWidth={1.75} className={loading ? "animate-spin" : ""} />
        </button>
      </header>

      {error && (
        <div
          className="flex cursor-pointer items-center gap-2 border-b border-line bg-[color-mix(in_srgb,var(--color-broken)_14%,transparent)] px-4 py-2 text-[12.5px] text-broken"
          onClick={() => setError(null)}
        >
          <TriangleAlert size={14} strokeWidth={1.75} />
          <span className="flex-1">{error}</span>
          <span className="text-faint">点击关闭</span>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* ---- scope rail ---- */}
        <nav className="flex w-[212px] flex-shrink-0 flex-col border-r border-line bg-rail">
          <div className="px-3 pb-1 pt-3">
            <span className="eyebrow">视图</span>
          </div>
          <div className="flex flex-col gap-0.5 px-2">
            <RailNav
              icon={<Layers size={15} strokeWidth={1.75} />}
              label="全部"
              count={counts.total}
              active={filter === "all"}
              onClick={() => setFilter("all")}
            />
            <RailNav
              icon={<GitCompare size={15} strokeWidth={1.75} />}
              label="内容漂移"
              count={counts.drift}
              tone="drift"
              active={filter === "drift"}
              onClick={() => setFilter(filter === "drift" ? "all" : "drift")}
            />
            <RailNav
              icon={<TriangleAlert size={15} strokeWidth={1.75} />}
              label="损坏"
              count={counts.broken}
              tone="broken"
              active={filter === "broken"}
              onClick={() => setFilter(filter === "broken" ? "all" : "broken")}
            />
            <RailNav
              icon={<Share2 size={15} strokeWidth={1.75} />}
              label="共享 / 多处"
              count={counts.shared}
              tone="shared"
              active={filter === "shared"}
              onClick={() => setFilter(filter === "shared" ? "all" : "shared")}
            />
          </div>

          <div className="mt-auto border-t border-line px-3 py-3">
            <div className="eyebrow mb-1.5">扫描根目录</div>
            <ul className="flex flex-col gap-1">
              {(result?.scanned_roots ?? []).map((r) => (
                <li key={r} className="code truncate text-[10.5px] text-faint" title={r}>
                  {r}
                </li>
              ))}
            </ul>
            {result && (
              <div className="mt-2.5 text-[11px] text-faint">
                <span className="text-dim">{result.total_instances}</span> 实例 ·{" "}
                <span className="text-dim">{groups.length}</span> skill
              </div>
            )}
          </div>
        </nav>

        {/* ---- list ---- */}
        <ul className="min-w-0 flex-1 overflow-y-auto">
          {visible.map((g) => {
            const active = selected === g.name;
            const desc = firstNonEmpty(g.instances.map((i) => i.description));
            const hasDisabled = g.instances.some((i) => !i.enabled);
            return (
              <li
                key={g.name}
                onClick={() => setSelected(g.name)}
                className={`relative cursor-pointer border-b border-line px-4 py-2.5 transition-colors ${
                  active ? "bg-surface-2" : "hover:bg-surface"
                }`}
              >
                <span
                  className={`absolute left-0 top-0 h-full w-[2px] origin-top bg-accent transition-transform duration-150 ${
                    active ? "scale-y-100" : "scale-y-0"
                  }`}
                />
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13.5px] font-semibold">{g.name}</span>
                  <span className="flex-1" />
                  {g.tools.map((t) => (
                    <ToolTag key={t} tool={t} />
                  ))}
                  <StatusDot drift={g.drift} broken={g.has_broken} />
                </div>
                <div className="mt-1 truncate text-[12px] text-dim">
                  {desc ?? <span className="text-faint">（无 description）</span>}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {g.scopes.map((s) => (
                    <span key={s} className="chip">
                      {SCOPE_LABELS[s]}
                    </span>
                  ))}
                  {g.shared && (
                    <span className="chip" style={{ color: "var(--color-shared)" }}>
                      <Share2 size={10} strokeWidth={2} /> ×{g.instances.length}
                    </span>
                  )}
                  {hasDisabled && <span className="chip">含禁用</span>}
                </div>
              </li>
            );
          })}
          {!loading && visible.length === 0 && (
            <li className="px-4 py-16 text-center text-faint">没有匹配的 skill</li>
          )}
        </ul>

        <Detail group={selectedGroup} onOp={requestOp} onEdit={openEditor} onSync={requestSync} />
      </div>

      {pending && (
        <ConfirmModal
          pending={pending}
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={confirmOp}
        />
      )}
      {editing && (
        <Suspense fallback={<div className="fixed inset-0 z-[55] bg-bg" />}>
          <Editor editing={editing} onClose={() => setEditing(null)} onError={setError} onSaved={onSaved} />
        </Suspense>
      )}
      {syncing && (
        <SyncModal
          syncing={syncing}
          busy={syncBusy}
          onCancel={() => setSyncing(null)}
          onConfirm={confirmSync}
        />
      )}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}

/* ---- scope rail nav item ---- */
function RailNav({
  icon,
  label,
  count,
  tone,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  tone?: "drift" | "broken" | "shared";
  active?: boolean;
  onClick: () => void;
}) {
  const toneColor =
    tone === "drift"
      ? "var(--color-drift)"
      : tone === "broken"
        ? "var(--color-broken)"
        : tone === "shared"
          ? "var(--color-shared)"
          : undefined;
  return (
    <button
      onClick={onClick}
      className={`group relative flex items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-left transition-colors ${
        active ? "bg-surface-2 text-ink" : "text-dim hover:bg-surface hover:text-ink"
      }`}
    >
      <span
        className={`absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-accent transition-transform duration-150 ${
          active ? "scale-y-100" : "scale-y-0"
        }`}
      />
      <span style={{ color: active && toneColor ? toneColor : undefined }} className="flex-shrink-0">
        {icon}
      </span>
      <span className="flex-1 text-[12.5px]">{label}</span>
      <span
        className="text-[12px] tabular-nums"
        style={{ color: count > 0 && toneColor ? toneColor : "var(--color-faint)" }}
      >
        {count}
      </span>
    </button>
  );
}

function StatusDot({ drift, broken }: { drift: boolean; broken: boolean }) {
  const cls = broken ? "dot dot-broken" : drift ? "dot dot-drift" : "dot dot-ok";
  const title = broken ? "损坏" : drift ? "内容漂移" : "正常";
  return <span className={cls} title={title} />;
}

function Detail({
  group,
  onOp,
  onEdit,
  onSync,
}: {
  group: SkillGroup | null;
  onOp: (op: OpRequest) => void;
  onEdit: (inst: SkillInstance) => void;
  onSync: (inst: SkillInstance, target: Tool) => void;
}) {
  if (!group) {
    return (
      <aside className="flex w-[404px] flex-shrink-0 items-center justify-center border-l border-line bg-panel p-8">
        <p className="max-w-[220px] text-center text-[12.5px] leading-relaxed text-faint">
          选择左侧 skill，查看每个安装实例并管理。
          <br />
          <span className="text-[11px]">↑ ↓ 键可在列表中移动</span>
        </p>
      </aside>
    );
  }
  return (
    <aside className="flex w-[404px] flex-shrink-0 flex-col overflow-y-auto border-l border-line bg-panel">
      <div className="border-b border-line px-4 py-3.5">
        <h2 className="text-[16px] font-semibold leading-tight">{group.name}</h2>
        <div className="mt-1 flex items-center gap-2 text-[11.5px] text-dim">
          <span>{group.instances.length} 个安装</span>
          <span className="text-faint">·</span>
          <div className="flex items-center gap-1">
            {group.tools.map((t) => (
              <ToolTag key={t} tool={t} />
            ))}
          </div>
        </div>
      </div>

      {group.drift && (
        <div className="mx-4 mt-4 flex items-start gap-2 rounded-md border border-[color-mix(in_srgb,var(--color-drift)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-drift)_10%,transparent)] px-3 py-2.5 text-[11.5px] leading-relaxed text-drift">
          <GitCompare size={14} strokeWidth={1.75} className="mt-0.5 flex-shrink-0" />
          <span>各副本正文不一致（body hash 不同）。同步阶段会提供 diff，此处仅提示。</span>
        </div>
      )}

      <div className="flex flex-col gap-3 p-4">
        {group.instances.map((inst) => (
          <InstanceCard key={inst.path} inst={inst} onOp={onOp} onEdit={onEdit} onSync={onSync} />
        ))}
      </div>
    </aside>
  );
}

function InstanceCard({
  inst,
  onOp,
  onEdit,
  onSync,
}: {
  inst: SkillInstance;
  onOp: (op: OpRequest) => void;
  onEdit: (inst: SkillInstance) => void;
  onSync: (inst: SkillInstance, target: Tool) => void;
}) {
  const isSymlink = inst.kind === "symlink";
  const inShared = inst.scope === "shared";
  const locked = inst.is_system;
  const spine = inst.tool === "claude" ? "var(--color-claude)" : "var(--color-codex)";

  return (
    <div
      className={`relative overflow-hidden rounded-md border border-line bg-surface p-3 pl-3.5 ${
        !inst.enabled ? "opacity-55" : ""
      }`}
    >
      <span className="absolute left-0 top-0 h-full w-[2px]" style={{ background: spine }} />

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="chip" style={{ color: "var(--color-dim)" }}>
          {SCOPE_LABELS[inst.scope]}
        </span>
        <ToolTag tool={inst.tool} />
        {isSymlink && <span className="chip">软链</span>}
        {inst.is_system && <span className="chip">内置</span>}
        {!inst.enabled && <span className="chip">已禁用</span>}
        {inst.broken && (
          <span className="chip" style={{ color: "var(--color-broken)", borderColor: "var(--color-broken)" }}>
            损坏
          </span>
        )}
        {inst.has_codex_companion && <span className="chip">openai.yaml</span>}
      </div>

      <code className="code mt-2 block leading-relaxed">{inst.path}</code>
      {inst.symlink_target && (
        <div className="code mt-1 text-shared">→ {inst.symlink_target}</div>
      )}
      {inst.error && (
        <div className="mt-2 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-broken">
          <TriangleAlert size={13} strokeWidth={1.75} className="mt-0.5 flex-shrink-0" />
          <span>{inst.error}</span>
        </div>
      )}

      {inst.when_to_use && (
        <div className="mt-2.5 flex gap-2 text-[12px] leading-relaxed">
          <span className="w-9 flex-shrink-0 text-faint">触发</span>
          <span className="text-dim">{inst.when_to_use}</span>
        </div>
      )}
      {inst.body_hash && (
        <div className="mt-1.5 flex gap-2 text-[12px]">
          <span className="w-9 flex-shrink-0 text-faint">body</span>
          <code className="code">{inst.body_hash.slice(0, 12)}</code>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        <button className="btn btn-sm" onClick={() => revealInFinder(inst.path)}>
          <FolderOpen size={13} strokeWidth={1.75} /> Finder
        </button>
        <button className="btn btn-sm" disabled={inst.broken} onClick={() => openPath(inst.skill_md_path)}>
          <ExternalLink size={13} strokeWidth={1.75} /> 打开
        </button>

        {!locked && !inst.broken && (
          <>
            <button className="btn btn-sm" onClick={() => onEdit(inst)}>
              <SquarePen size={13} strokeWidth={1.75} /> 编辑
            </button>

            {inst.enabled ? (
              <button className="btn btn-sm" onClick={() => onOp({ kind: "disable", path: inst.path })}>
                <PowerOff size={13} strokeWidth={1.75} /> 禁用
              </button>
            ) : (
              <button
                className="btn btn-sm btn-go"
                onClick={() => onOp({ kind: "enable", path: inst.path })}
              >
                <Power size={13} strokeWidth={1.75} /> 启用
              </button>
            )}

            {!isSymlink && !inShared && (
              <button
                className="btn btn-sm"
                onClick={() => onOp({ kind: "promote_to_shared", path: inst.path })}
              >
                <ArrowUpFromLine size={13} strokeWidth={1.75} /> 提升为共享
              </button>
            )}

            {isSymlink && (
              <button
                className="btn btn-sm btn-danger"
                onClick={() => onOp({ kind: "remove_link", path: inst.path })}
              >
                <Link2Off size={13} strokeWidth={1.75} /> 移除链接
              </button>
            )}

            <button
              className="btn btn-sm"
              onClick={() => onSync(inst, inst.tool === "claude" ? "codex" : "claude")}
            >
              <ArrowLeftRight size={13} strokeWidth={1.75} />
              同步到 {inst.tool === "claude" ? "Codex" : "Claude"}
            </button>
          </>
        )}
        {locked && (
          <span className="self-center text-[11px] text-faint">内置 · 只读</span>
        )}
      </div>
    </div>
  );
}

function SyncModal({
  syncing,
  busy,
  onCancel,
  onConfirm,
}: {
  syncing: Syncing;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { preview: p } = syncing;
  const blocked = p.warnings.some(
    (w) => w.includes("拒绝") || w.includes("不支持") || w.includes("同一目录"),
  );
  const noChange = p.body_status === "identical";
  const statusLabel =
    p.body_status === "new" ? "新建" : p.body_status === "identical" ? "无变化" : "将覆盖（内容不同）";
  const statusColor =
    p.body_status === "new"
      ? "var(--color-shared)"
      : p.body_status === "identical"
        ? "var(--color-faint)"
        : "var(--color-drift)";

  return (
    <ModalShell onCancel={onCancel} wide>
      <h3 className="mb-1 flex items-center gap-2.5 text-[15px] font-semibold">
        <span>
          同步 {p.source_tool} <ArrowLeftRight className="inline" size={13} strokeWidth={2} />{" "}
          {p.target_tool}
        </span>
        <span
          className="rounded-sm px-2 py-0.5 text-[11px] font-medium"
          style={{ background: "color-mix(in srgb, " + statusColor + " 18%, transparent)", color: statusColor }}
        >
          {statusLabel}
        </span>
      </h3>
      <code className="code mb-3 block text-faint">{p.target_skill_md}</code>

      <Section label="字段映射">
        <table className="w-full border-collapse text-[12px]">
          <tbody>
            {p.field_map.map((f, i) => (
              <tr key={i} className="border-b border-line">
                <td className="py-1 pr-2 font-medium whitespace-nowrap">{f.field}</td>
                <td className="code py-1">{f.from}</td>
                <td className="px-2 text-center text-accent">→</td>
                <td className="code py-1">{f.to}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {p.skill_md_diff && !noChange && (
        <Section label="SKILL.md diff">
          <pre className="max-h-[280px] overflow-auto rounded-sm border border-line bg-bg p-2.5 text-[11.5px] leading-[1.55] whitespace-pre-wrap break-all">
            {p.skill_md_diff.split("\n").map((line, i) => {
              const color = line.startsWith("+")
                ? "var(--color-accent)"
                : line.startsWith("-")
                  ? "var(--color-broken)"
                  : "var(--color-dim)";
              const bg = line.startsWith("+")
                ? "color-mix(in srgb, var(--color-accent) 11%, transparent)"
                : line.startsWith("-")
                  ? "color-mix(in srgb, var(--color-broken) 12%, transparent)"
                  : "transparent";
              return (
                <div key={i} style={{ color, background: bg }}>
                  {line || " "}
                </div>
              );
            })}
          </pre>
        </Section>
      )}

      {p.openai_yaml && (
        <Section label="将生成 agents/openai.yaml">
          <pre className="rounded-sm border border-line bg-bg p-2.5 text-[11.5px] leading-[1.55] whitespace-pre-wrap text-codex">
            {p.openai_yaml}
          </pre>
        </Section>
      )}

      {p.warnings.length > 0 && (
        <Callout tone={blocked ? "broken" : "shared"}>
          {p.warnings.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </Callout>
      )}
      {p.target_exists && !blocked && (
        <Callout tone="shared">目标已存在，写入前会先备份整个目录。</Callout>
      )}

      <ModalActions>
        <button className="btn" onClick={onCancel} disabled={busy}>
          取消
        </button>
        <button className="btn btn-go" onClick={onConfirm} disabled={busy || blocked || noChange}>
          {busy ? "同步中…" : "确认同步"}
        </button>
      </ModalActions>
    </ModalShell>
  );
}

function ConfirmModal({
  pending,
  busy,
  onCancel,
  onConfirm,
}: {
  pending: Pending;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const blocked = pending.preview.warnings.length > 0;
  return (
    <ModalShell onCancel={onCancel}>
      <h3 className="mb-3.5 text-[15px] font-semibold">{pending.preview.summary}</h3>
      <Section label="将执行">
        <ol className="flex list-decimal flex-col gap-1 pl-4 text-[12.5px] leading-relaxed marker:text-faint">
          {pending.preview.steps.map((s, i) => (
            <li key={i} className="break-all">
              {s}
            </li>
          ))}
        </ol>
      </Section>
      {pending.preview.backup_note && <Callout tone="shared">{pending.preview.backup_note}</Callout>}
      {blocked && (
        <Callout tone="broken">
          {pending.preview.warnings.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </Callout>
      )}
      <ModalActions>
        <button className="btn" onClick={onCancel} disabled={busy}>
          取消
        </button>
        <button className="btn btn-go" onClick={onConfirm} disabled={busy || blocked}>
          {busy ? "执行中…" : "确认执行"}
        </button>
      </ModalActions>
    </ModalShell>
  );
}

/* ---- shared modal primitives ---- */
function ModalShell({
  children,
  onCancel,
  wide,
}: {
  children: React.ReactNode;
  onCancel: () => void;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-5 backdrop-blur-[2px]"
      onClick={onCancel}
    >
      <div
        className={`max-h-[86vh] w-full overflow-y-auto rounded-md border border-line-2 bg-panel p-5 shadow-[0_24px_64px_rgba(0,0,0,0.55)] ${
          wide ? "max-w-[620px]" : "max-w-[460px]"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3.5">
      <div className="eyebrow mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function Callout({ tone, children }: { tone: "shared" | "broken"; children: React.ReactNode }) {
  const color = tone === "broken" ? "var(--color-broken)" : "var(--color-shared)";
  return (
    <div
      className="mb-3.5 flex flex-col gap-0.5 rounded-sm px-3 py-2.5 text-[12px] leading-relaxed break-all"
      style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}
    >
      {children}
    </div>
  );
}

function ModalActions({ children }: { children: React.ReactNode }) {
  return <div className="flex justify-end gap-2 pt-1">{children}</div>;
}

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [message, onDone]);
  return (
    <div
      className="fixed bottom-9 left-1/2 z-[60] max-w-[80vw] -translate-x-1/2 rounded-md border border-line-2 bg-panel px-4 py-2.5 text-[12.5px] break-all shadow-[0_16px_40px_rgba(0,0,0,0.5)]"
      style={{ animation: "toast-in 180ms ease-out" }}
    >
      {message}
    </div>
  );
}

function firstNonEmpty(arr: (string | null)[]): string | null {
  for (const v of arr) if (v && v.trim()) return v;
  return null;
}

export default App;
