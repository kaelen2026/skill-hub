import { useState } from "react";
import { Plus, X, Trash2, Check, Tag } from "lucide-react";
import { type GroupConfig } from "../types";

export function CategoryEditor({
  skill,
  config,
  onAssign,
  onUnassign,
  onCreateCategory,
  onDeleteCategory,
}: {
  skill: string;
  config: GroupConfig;
  onAssign: (skill: string, cat: string) => void;
  onUnassign: (skill: string, cat: string) => void;
  onCreateCategory: (name: string) => void;
  onDeleteCategory: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const assigned = config.assignments[skill] ?? [];
  const accentChip = {
    color: "var(--color-accent)",
    borderColor: "color-mix(in srgb, var(--color-accent) 45%, transparent)",
  };

  function submitNew() {
    const name = draft.trim();
    if (!name) return;
    if (!config.categories.includes(name)) onCreateCategory(name);
    onAssign(skill, name);
    setDraft("");
  }

  return (
    <div className="border-b border-line px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="eyebrow">分类</span>
        <button
          className="icon-btn ml-auto h-6 w-6"
          onClick={() => setOpen((o) => !o)}
          title={open ? "收起" : "管理分类"}
          aria-label={open ? "收起" : "管理分类"}
        >
          {open ? <X size={13} strokeWidth={1.75} /> : <Plus size={13} strokeWidth={1.75} />}
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {assigned.length === 0 && !open && (
          <span className="text-[11.5px] text-faint">未归类 · 点击 + 添加</span>
        )}
        {assigned.map((c) => (
          <button
            key={c}
            className="chip"
            style={accentChip}
            onClick={() => onUnassign(skill, c)}
            title="点击移除"
          >
            <Tag size={9} strokeWidth={2} /> {c} <X size={10} strokeWidth={2} className="opacity-60" />
          </button>
        ))}
      </div>

      {open && (
        <div className="mt-2.5 rounded-md border border-line bg-surface p-2">
          <div className="flex flex-col gap-0.5">
            {config.categories.length === 0 && (
              <span className="px-1 py-1 text-[11.5px] text-faint">还没有分类，在下方新建</span>
            )}
            {config.categories.map((c) => {
              const on = assigned.includes(c);
              return (
                <div
                  key={c}
                  className="flex items-center gap-2 rounded-sm px-1 py-1 hover:bg-surface-2"
                >
                  <button
                    className="flex flex-1 items-center gap-2 text-left"
                    onClick={() => (on ? onUnassign(skill, c) : onAssign(skill, c))}
                  >
                    <span
                      className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-[3px] border"
                      style={{
                        borderColor: on ? "var(--color-accent)" : "var(--color-line-2)",
                        background: on ? "var(--color-accent)" : "transparent",
                      }}
                    >
                      {on && <Check size={10} strokeWidth={3} color="var(--color-bg)" />}
                    </span>
                    <span className="text-[12px]">{c}</span>
                  </button>
                  <button
                    className="icon-btn h-5 w-5 text-faint hover:text-broken"
                    title="删除该分类（从所有 skill 移除）"
                    aria-label="删除该分类"
                    onClick={() => onDeleteCategory(c)}
                  >
                    <Trash2 size={11} strokeWidth={1.75} />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 border-t border-line pt-2">
            <input
              className="field flex-1 px-2 py-1 text-[12px]"
              placeholder="新建分类…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitNew();
              }}
            />
            <button className="btn btn-sm btn-go" onClick={submitNew} disabled={!draft.trim()}>
              添加
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
