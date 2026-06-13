import { useEffect, useMemo, useRef, useState } from "react";
import {
  scanSkills,
  revealInFinder,
  openPath,
  previewOp,
  applyOp,
  readSkillMd,
  validateSkillMd,
  writeSkillMd,
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
  type SkillFile,
  type ValidationReport,
  type Tool,
  type SyncRequest,
  type SyncPreview,
} from "./types";
import "./App.css";

interface Pending {
  op: OpRequest;
  preview: OpPreview;
}

interface Editing {
  inst: SkillInstance;
  file: SkillFile;
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
  const [filter, setFilter] = useState<"all" | "drift" | "broken" | "shared">("all");

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

  // Action button → fetch preview → open confirm modal.
  async function requestOp(op: OpRequest) {
    try {
      const preview = await previewOp(op);
      setPending({ op, preview });
    } catch (e) {
      setError(String(e));
    }
  }

  async function openEditor(inst: SkillInstance) {
    try {
      const file = await readSkillMd(inst.path);
      setEditing({ inst, file });
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
      const preview = await previewSync(req);
      setSyncing({ req, preview });
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
        setToast(
          res.backup_path
            ? `已完成 · 备份于 ${res.backup_path}`
            : "已完成",
        );
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

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">◆</span>
          <span className="brand-name">Skill Hub</span>
          <span className="brand-tag">统一管理</span>
        </div>
        <div className="topbar-actions">
          <input
            className="search"
            placeholder="搜索 skill / 描述 / 触发词…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="btn" onClick={rescan} disabled={loading}>
            {loading ? "扫描中…" : "重新扫描"}
          </button>
        </div>
      </header>

      <div className="statbar">
        <Stat label="全部" value={counts.total} active={filter === "all"} onClick={() => setFilter("all")} />
        <Stat label="内容漂移" value={counts.drift} tone="drift" active={filter === "drift"} onClick={() => setFilter(filter === "drift" ? "all" : "drift")} />
        <Stat label="损坏" value={counts.broken} tone="broken" active={filter === "broken"} onClick={() => setFilter(filter === "broken" ? "all" : "broken")} />
        <Stat label="共享/多处" value={counts.shared} tone="shared" active={filter === "shared"} onClick={() => setFilter(filter === "shared" ? "all" : "shared")} />
      </div>

      {error && (
        <div className="error" onClick={() => setError(null)}>
          {error}（点击关闭）
        </div>
      )}

      <div className="body">
        <ul className="list">
          {visible.map((g) => (
            <li
              key={g.name}
              className={`row ${selected === g.name ? "row-active" : ""}`}
              onClick={() => setSelected(g.name)}
            >
              <div className="row-head">
                <span className="row-name">{g.name}</span>
                <div className="badges">
                  {g.drift && <Badge tone="drift">漂移</Badge>}
                  {g.has_broken && <Badge tone="broken">损坏</Badge>}
                  {g.instances.some((i) => !i.enabled) && <Badge tone="off">含禁用</Badge>}
                  {g.shared && <Badge tone="shared">共享 ×{g.instances.length}</Badge>}
                  {g.tools.map((t) => (
                    <Badge key={t} tone={t === "claude" ? "claude" : "codex"}>
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="row-desc">
                {firstNonEmpty(g.instances.map((i) => i.description)) ?? (
                  <span className="muted">（无 description）</span>
                )}
              </div>
              <div className="row-scopes">
                {g.scopes.map((s) => (
                  <span key={s} className="scope-chip">
                    {SCOPE_LABELS[s]}
                  </span>
                ))}
              </div>
            </li>
          ))}
          {!loading && visible.length === 0 && <li className="empty">没有匹配的 skill</li>}
        </ul>

        <Detail
          group={selectedGroup}
          onOp={requestOp}
          onEdit={openEditor}
          onSync={requestSync}
        />
      </div>

      {result && (
        <footer className="footer">
          {result.total_instances} 个安装实例 · {groups.length} 个唯一 skill · 扫描了{" "}
          {result.scanned_roots.length} 个根目录
        </footer>
      )}

      {pending && (
        <ConfirmModal
          pending={pending}
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={confirmOp}
        />
      )}

      {editing && (
        <Editor
          editing={editing}
          onClose={() => setEditing(null)}
          onError={setError}
          onSaved={onSaved}
        />
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
      <aside className="detail detail-empty">
        <p className="muted">选择左侧 skill 查看每个安装实例并管理</p>
      </aside>
    );
  }
  return (
    <aside className="detail">
      <h2 className="detail-title">{group.name}</h2>
      {group.drift && (
        <div className="notice notice-drift">
          各副本正文不一致（body hash 不同）。同步阶段会提供 diff，此处仅提示。
        </div>
      )}
      <div className="instances">
        {group.instances.map((inst) => (
          <InstanceCard
            key={inst.path}
            inst={inst}
            onOp={onOp}
            onEdit={onEdit}
            onSync={onSync}
          />
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
  // System (Codex bundled) installs are read-only.
  const locked = inst.is_system;

  return (
    <div className={`inst ${!inst.enabled ? "inst-disabled" : ""}`}>
      <div className="inst-head">
        <span className={`scope-chip scope-${inst.scope}`}>{SCOPE_LABELS[inst.scope]}</span>
        <span className="inst-tool">{inst.tool}</span>
        {isSymlink && <span className="inst-tag">软链</span>}
        {inst.is_system && <span className="inst-tag">内置</span>}
        {!inst.enabled && <span className="inst-tag inst-tag-off">已禁用</span>}
        {inst.broken && <span className="inst-tag inst-tag-bad">损坏</span>}
        {inst.has_codex_companion && <span className="inst-tag">openai.yaml</span>}
      </div>
      <code className="inst-path">{inst.path}</code>
      {inst.symlink_target && <div className="inst-link">→ {inst.symlink_target}</div>}
      {inst.error && <div className="inst-err">⚠ {inst.error}</div>}
      {inst.when_to_use && (
        <div className="inst-field">
          <span className="inst-label">触发</span>
          <span>{inst.when_to_use}</span>
        </div>
      )}
      {inst.body_hash && (
        <div className="inst-field">
          <span className="inst-label">body</span>
          <code className="hash">{inst.body_hash.slice(0, 12)}</code>
        </div>
      )}

      <div className="inst-actions">
        <button className="btn btn-sm" onClick={() => revealInFinder(inst.path)}>
          Finder
        </button>
        <button
          className="btn btn-sm"
          disabled={inst.broken}
          onClick={() => openPath(inst.skill_md_path)}
        >
          打开
        </button>

        {!locked && !inst.broken && (
          <button className="btn btn-sm" onClick={() => onEdit(inst)}>
            编辑
          </button>
        )}

        {!locked && !inst.broken && (
          <>
            {inst.enabled ? (
              <button className="btn btn-sm" onClick={() => onOp({ kind: "disable", path: inst.path })}>
                禁用
              </button>
            ) : (
              <button className="btn btn-sm btn-go" onClick={() => onOp({ kind: "enable", path: inst.path })}>
                启用
              </button>
            )}

            {!isSymlink && !inShared && (
              <button
                className="btn btn-sm"
                onClick={() => onOp({ kind: "promote_to_shared", path: inst.path })}
              >
                提升为共享
              </button>
            )}

            {isSymlink && (
              <button
                className="btn btn-sm btn-danger"
                onClick={() => onOp({ kind: "remove_link", path: inst.path })}
              >
                移除链接
              </button>
            )}

            {inst.tool === "claude" ? (
              <button className="btn btn-sm" onClick={() => onSync(inst, "codex")}>
                → 同步到 Codex
              </button>
            ) : (
              <button className="btn btn-sm" onClick={() => onSync(inst, "claude")}>
                → 同步到 Claude
              </button>
            )}
          </>
        )}
        {locked && <span className="inst-locked">内置 · 只读</span>}
      </div>
    </div>
  );
}

function Editor({
  editing,
  onClose,
  onError,
  onSaved,
}: {
  editing: Editing;
  onClose: () => void;
  onError: (e: string) => void;
  onSaved: (backupPath: string | null) => void;
}) {
  const { inst, file } = editing;
  const [content, setContent] = useState(file.content);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [saving, setSaving] = useState(false);
  const debounce = useRef<number | undefined>(undefined);

  const dirty = content !== file.content;

  // Debounced validation against the instance's tool conventions.
  useEffect(() => {
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => {
      validateSkillMd(content, inst.tool)
        .then(setReport)
        .catch((e) => onError(String(e)));
    }, 220);
    return () => window.clearTimeout(debounce.current);
  }, [content, inst.tool, onError]);

  const hasErrors = report ? !report.ok : false;
  const canSave = file.editable && dirty && !hasErrors && !saving;

  async function save() {
    setSaving(true);
    try {
      const res = await writeSkillMd(file.file_path, content);
      if (res.ok) onSaved(res.backup_path);
      else onError(res.error ?? "写入失败");
    } catch (e) {
      onError(String(e));
    } finally {
      setSaving(false);
    }
  }

  function tryClose() {
    if (dirty && !window.confirm("有未保存的修改，确定放弃？")) return;
    onClose();
  }

  return (
    <div className="editor-overlay">
      <div className="editor-head">
        <div className="editor-title">
          <span className="editor-name">{inst.name}</span>
          <span className="scope-chip">{SCOPE_LABELS[inst.scope]}</span>
          <span className="editor-tool">{inst.tool}</span>
          {!file.enabled && <span className="inst-tag inst-tag-off">已禁用</span>}
          {!file.editable && (
            <span className="inst-tag inst-tag-bad">
              {file.locked_reason ?? "只读"}
            </span>
          )}
        </div>
        <div className="editor-head-actions">
          <button className="btn" onClick={tryClose} disabled={saving}>
            关闭
          </button>
          <button className="btn btn-go" onClick={save} disabled={!canSave}>
            {saving ? "保存中…" : dirty ? "保存" : "无改动"}
          </button>
        </div>
      </div>
      <code className="editor-path">{file.file_path}</code>

      <div className="editor-body">
        <textarea
          className="editor-text"
          value={content}
          spellCheck={false}
          onChange={(e) => setContent(e.target.value)}
          readOnly={!file.editable}
        />
        <div className="editor-side">
          <div className="editor-side-head">校验</div>
          {report && (
            <>
              <div className="vrow">
                <span className="vlabel">格式</span>
                <span className={`vfmt vfmt-${report.detected_format}`}>
                  {report.detected_format === "claude"
                    ? "Claude"
                    : report.detected_format === "codex"
                      ? "Codex"
                      : "未识别"}
                </span>
              </div>
              <div className="vrow">
                <span className="vlabel">name</span>
                <span>{report.name ?? <span className="muted">—</span>}</span>
              </div>
              <div
                className={`vstatus ${report.ok ? "vstatus-ok" : "vstatus-bad"}`}
              >
                {report.ok ? "✓ 可保存" : "✗ 有错误，需修正"}
              </div>
              <ul className="issues">
                {report.issues.length === 0 && (
                  <li className="muted">没有问题</li>
                )}
                {report.issues.map((iss, i) => (
                  <li key={i} className={`issue issue-${iss.level}`}>
                    <span className="issue-field">{iss.field}</span>
                    {iss.message}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
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
  const blocked =
    p.warnings.some((w) => w.includes("拒绝") || w.includes("不支持") || w.includes("同一目录"));
  const noChange = p.body_status === "identical";
  const statusLabel =
    p.body_status === "new" ? "新建" : p.body_status === "identical" ? "无变化" : "将覆盖（内容不同）";

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">
          同步 {p.source_tool} → {p.target_tool}
          <span className={`sync-status sync-${p.body_status}`}>{statusLabel}</span>
        </h3>
        <code className="modal-target">{p.target_skill_md}</code>

        <div className="modal-section">
          <div className="modal-label">字段映射</div>
          <table className="fieldmap">
            <tbody>
              {p.field_map.map((f, i) => (
                <tr key={i}>
                  <td className="fm-field">{f.field}</td>
                  <td className="fm-from">{f.from}</td>
                  <td className="fm-arrow">→</td>
                  <td className="fm-to">{f.to}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {p.skill_md_diff && !noChange && (
          <div className="modal-section">
            <div className="modal-label">SKILL.md diff</div>
            <pre className="diff">
              {p.skill_md_diff.split("\n").map((line, i) => {
                const cls =
                  line.startsWith("+") ? "diff-add" : line.startsWith("-") ? "diff-del" : "diff-ctx";
                return (
                  <div key={i} className={cls}>
                    {line || " "}
                  </div>
                );
              })}
            </pre>
          </div>
        )}

        {p.openai_yaml && (
          <div className="modal-section">
            <div className="modal-label">将生成 agents/openai.yaml</div>
            <pre className="yaml-gen">{p.openai_yaml}</pre>
          </div>
        )}

        {p.warnings.length > 0 && (
          <div className={blocked ? "modal-warnings" : "modal-backup"}>
            {p.warnings.map((w, i) => (
              <div key={i}>{blocked ? "⚠" : "ℹ"} {w}</div>
            ))}
          </div>
        )}

        {p.target_exists && !blocked && (
          <div className="modal-backup">🛟 目标已存在，写入前会先备份整个目录</div>
        )}

        <div className="modal-actions">
          <button className="btn" onClick={onCancel} disabled={busy}>
            取消
          </button>
          <button
            className="btn btn-go"
            onClick={onConfirm}
            disabled={busy || blocked || noChange}
          >
            {busy ? "同步中…" : "确认同步"}
          </button>
        </div>
      </div>
    </div>
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
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{pending.preview.summary}</h3>
        <div className="modal-section">
          <div className="modal-label">将执行</div>
          <ol className="modal-steps">
            {pending.preview.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
        {pending.preview.backup_note && (
          <div className="modal-backup">🛟 {pending.preview.backup_note}</div>
        )}
        {blocked && (
          <div className="modal-warnings">
            {pending.preview.warnings.map((w, i) => (
              <div key={i}>⚠ {w}</div>
            ))}
          </div>
        )}
        <div className="modal-actions">
          <button className="btn" onClick={onCancel} disabled={busy}>
            取消
          </button>
          <button className="btn btn-go" onClick={onConfirm} disabled={busy || blocked}>
            {busy ? "执行中…" : "确认执行"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [message, onDone]);
  return <div className="toast">{message}</div>;
}

function Stat({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  tone?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button className={`stat ${active ? "stat-active" : ""} ${tone ? `stat-${tone}` : ""}`} onClick={onClick}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </button>
  );
}

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

function firstNonEmpty(arr: (string | null)[]): string | null {
  for (const v of arr) if (v && v.trim()) return v;
  return null;
}

export default App;
