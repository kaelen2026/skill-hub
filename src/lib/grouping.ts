import {
  SCOPE_LABELS,
  type SkillGroup,
  type Scope,
  type GroupBy,
  type GroupConfig,
} from "../types";

/** A collapsible run of skills under one section header. */
export interface Section {
  key: string;
  label: string;
  items: SkillGroup[];
}

export const UNCATEGORIZED = "__uncategorized__";
const SCOPE_ORDER: Scope[] = ["claude-user", "shared", "codex-user", "project"];

export const GROUP_BY_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "none", label: "不分组" },
  { value: "category", label: "分类" },
  { value: "tool", label: "工具" },
  { value: "scope", label: "作用域" },
];

// A skill spans tools/scopes; bucket it into one combined section so each skill
// lands in exactly one place (no duplicate rows / React-key clashes) for those
// dimensions. Categories are the exception — see partition().
function toolBucket(g: SkillGroup): { key: string; label: string } {
  const claude = g.tools.includes("claude");
  const codex = g.tools.includes("codex");
  if (claude && codex) return { key: "claude+codex", label: "Claude · Codex" };
  if (codex) return { key: "codex", label: "Codex" };
  return { key: "claude", label: "Claude" };
}

function scopeBucket(g: SkillGroup): { key: string; label: string } {
  const sorted = [...g.scopes].sort(
    (a, b) => SCOPE_ORDER.indexOf(a) - SCOPE_ORDER.indexOf(b),
  );
  return {
    key: sorted.join("+") || "—",
    label: sorted.map((s) => SCOPE_LABELS[s]).join(" · ") || "—",
  };
}

// Split the (already search/filter-narrowed) list into ordered sections.
export function partition(items: SkillGroup[], by: GroupBy, cfg: GroupConfig): Section[] {
  if (by === "none") return [{ key: "all", label: "", items }];

  const map = new Map<string, Section>();
  const push = (key: string, label: string, g: SkillGroup) => {
    const s = map.get(key) ?? { key, label, items: [] };
    s.items.push(g);
    map.set(key, s);
  };

  if (by === "category") {
    for (const g of items) {
      const cats = cfg.assignments[g.name] ?? [];
      if (cats.length === 0) push(UNCATEGORIZED, "未分类", g);
      else for (const c of cats) push(`cat:${c}`, c, g);
    }
    // Follow the user's declared category order; uncategorized always last.
    const rank = (key: string) => {
      if (key === UNCATEGORIZED) return Number.MAX_SAFE_INTEGER;
      const i = cfg.categories.indexOf(key.slice(4));
      return i < 0 ? Number.MAX_SAFE_INTEGER - 1 : i;
    };
    return [...map.values()].sort((a, b) => rank(a.key) - rank(b.key));
  }

  for (const g of items) {
    const b = by === "tool" ? toolBucket(g) : scopeBucket(g);
    push(b.key, b.label, g);
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
}
