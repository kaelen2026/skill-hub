import { Share2, ChevronRight, Tag } from "lucide-react";
import { SCOPE_LABELS, type SkillGroup } from "../types";
import type { Section } from "../lib/grouping";
import { firstNonEmpty } from "../lib/format";
import { ToolTag } from "../ui";

export function SkillList({
  sections,
  collapsedSections,
  selected,
  assignments,
  loading,
  visibleCount,
  onToggleSection,
  onSelect,
}: {
  sections: Section[];
  collapsedSections: Set<string>;
  selected: string | null;
  assignments: Record<string, string[]>;
  loading: boolean;
  visibleCount: number;
  onToggleSection: (key: string) => void;
  onSelect: (name: string) => void;
}) {
  return (
    <>
      {sections.map((s) => {
        const collapsed = collapsedSections.has(s.key);
        return (
          <div key={s.key}>
            {s.label && (
              <button
                onClick={() => onToggleSection(s.key)}
                className="sticky top-0 z-10 flex w-full items-center gap-2 border-b border-line bg-rail px-3.5 py-1.5 text-left hover:bg-surface"
              >
                <ChevronRight
                  size={13}
                  strokeWidth={2}
                  className={`text-faint transition-transform duration-150 ${
                    collapsed ? "" : "rotate-90"
                  }`}
                />
                <span className="eyebrow">{s.label}</span>
                <span className="ml-auto text-[11px] tabular-nums text-faint">
                  {s.items.length}
                </span>
              </button>
            )}
            {!collapsed && (
              <ul>
                {s.items.map((g) => (
                  <SkillRow
                    key={`${s.key}/${g.name}`}
                    g={g}
                    active={selected === g.name}
                    categories={assignments[g.name] ?? []}
                    onClick={() => onSelect(g.name)}
                  />
                ))}
              </ul>
            )}
          </div>
        );
      })}
      {!loading && visibleCount === 0 && (
        <div className="px-4 py-16 text-center text-faint">没有匹配的 skill</div>
      )}
    </>
  );
}

function SkillRow({
  g,
  active,
  categories,
  onClick,
}: {
  g: SkillGroup;
  active: boolean;
  categories: string[];
  onClick: () => void;
}) {
  const desc = firstNonEmpty(g.instances.map((i) => i.description));
  const hasDisabled = g.instances.some((i) => !i.enabled);
  return (
    <li
      onClick={onClick}
      className={`relative cursor-pointer border-b border-line px-4 py-2.5 transition-colors ${
        active ? "bg-surface-2" : "hover:bg-surface"
      }`}
    >
      <span
        className={`absolute left-0 top-0 h-full w-0.5 origin-top bg-accent transition-transform duration-150 ${
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
        {categories.map((c) => (
          <span
            key={c}
            className="chip"
            style={{
              color: "var(--color-accent)",
              borderColor: "color-mix(in srgb, var(--color-accent) 45%, transparent)",
            }}
          >
            <Tag size={9} strokeWidth={2} /> {c}
          </span>
        ))}
      </div>
    </li>
  );
}

function StatusDot({ drift, broken }: { drift: boolean; broken: boolean }) {
  const cls = broken ? "dot dot-broken" : drift ? "dot dot-drift" : "dot dot-ok";
  const title = broken ? "损坏" : drift ? "内容漂移" : "正常";
  return <span className={cls} title={title} />;
}
