import { useState } from "react";
import {
  TriangleAlert,
  FolderOpen,
  ExternalLink,
  SquarePen,
  Power,
  PowerOff,
  ArrowUpFromLine,
  Link2Off,
  ArrowLeftRight,
  FileText,
} from "lucide-react";
import { revealInFinder, openPath } from "../api";
import {
  SCOPE_LABELS,
  type SkillInstance,
  type SkillFileRef,
  type OpRequest,
  type Tool,
} from "../types";
import { ToolTag } from "../ui";
import { formatSize } from "../lib/format";

// Bundled files a skill ships alongside SKILL.md. Collapsed past a few rows so
// a big bundle doesn't dominate the card; each row opens the file.
function FileList({
  files,
  onOpen,
}: {
  files: SkillFileRef[];
  onOpen: (f: SkillFileRef) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const LIMIT = 6;
  const shown = expanded ? files : files.slice(0, LIMIT);
  const hidden = files.length - shown.length;

  return (
    <div className="mt-3 border-t border-line pt-2.5">
      <div className="eyebrow mb-1.5 flex items-center gap-1.5">
        <FileText size={11} strokeWidth={2} />
        引用文件
        <span className="text-faint">· {files.length}</span>
      </div>
      <ul className="flex flex-col gap-0.5">
        {shown.map((f) => (
          <li key={f.path}>
            <button
              onClick={() => onOpen(f)}
              title={`在应用内编辑 ${f.rel}`}
              className="group flex w-full items-center gap-2 rounded-xs px-1.5 py-1 text-left transition-colors hover:bg-surface-2"
            >
              <code className="code min-w-0 flex-1 truncate text-dim group-hover:text-ink">
                {f.rel}
              </code>
              <span className="flex-shrink-0 text-[10.5px] tabular-nums text-faint">
                {formatSize(f.size)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="mt-1 px-1.5 text-[11px] text-faint hover:text-dim"
        >
          展开其余 {hidden} 个…
        </button>
      )}
      {expanded && files.length > LIMIT && (
        <button
          onClick={() => setExpanded(false)}
          className="mt-1 px-1.5 text-[11px] text-faint hover:text-dim"
        >
          收起
        </button>
      )}
    </div>
  );
}

export function InstanceCard({
  inst,
  onOp,
  onEdit,
  onOpenFile,
  onSync,
}: {
  inst: SkillInstance;
  onOp: (op: OpRequest) => void;
  onEdit: (inst: SkillInstance) => void;
  onOpenFile: (inst: SkillInstance, path: string) => void;
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
      <span className="absolute left-0 top-0 h-full w-0.5" style={{ background: spine }} />

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

      {inst.files && inst.files.length > 0 && (
        <FileList files={inst.files} onOpen={(f) => onOpenFile(inst, f.path)} />
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
