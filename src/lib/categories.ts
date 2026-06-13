import { type GroupConfig } from "../types";

// ---- pure GroupConfig transforms (frontend mirrors backend normalize) ----
export function assignCategory(cfg: GroupConfig, skill: string, cat: string): GroupConfig {
  const cur = cfg.assignments[skill] ?? [];
  if (cur.includes(cat)) return cfg;
  return { ...cfg, assignments: { ...cfg.assignments, [skill]: [...cur, cat] } };
}

export function unassignCategory(cfg: GroupConfig, skill: string, cat: string): GroupConfig {
  const next = (cfg.assignments[skill] ?? []).filter((c) => c !== cat);
  const assignments = { ...cfg.assignments };
  if (next.length) assignments[skill] = next;
  else delete assignments[skill];
  return { ...cfg, assignments };
}

export function createCategory(cfg: GroupConfig, name: string): GroupConfig {
  const n = name.trim();
  if (!n || cfg.categories.includes(n)) return cfg;
  return { ...cfg, categories: [...cfg.categories, n] };
}

export function deleteCategory(cfg: GroupConfig, name: string): GroupConfig {
  const assignments: Record<string, string[]> = {};
  for (const [skill, cats] of Object.entries(cfg.assignments)) {
    const kept = cats.filter((c) => c !== name);
    if (kept.length) assignments[skill] = kept;
  }
  return { ...cfg, categories: cfg.categories.filter((c) => c !== name), assignments };
}
