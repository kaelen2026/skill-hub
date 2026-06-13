// Mirrors the Rust structs in src-tauri/src/scanner.rs (serde-serialized).

export type Tool = "claude" | "codex";
export type Scope = "claude-user" | "shared" | "codex-user" | "project";

export interface SkillInstance {
  name: string;
  path: string;
  skill_md_path: string;
  scope: Scope;
  tool: Tool;
  kind: "directory" | "symlink";
  symlink_target: string | null;
  broken: boolean;
  is_system: boolean;
  enabled: boolean;
  description: string | null;
  when_to_use: string | null;
  short_description: string | null;
  body_hash: string | null;
  has_codex_companion: boolean;
  error: string | null;
}

export interface SkillGroup {
  name: string;
  instances: SkillInstance[];
  tools: Tool[];
  scopes: Scope[];
  shared: boolean;
  drift: boolean;
  has_broken: boolean;
}

export interface ScanResult {
  groups: SkillGroup[];
  scanned_roots: string[];
  total_instances: number;
}

// ---- Phase 2: write operations ----

export type OpRequest =
  | { kind: "disable"; path: string }
  | { kind: "enable"; path: string }
  | { kind: "promote_to_shared"; path: string }
  | { kind: "link_to_scope"; source: string; scope: Scope }
  | { kind: "remove_link"; path: string };

export interface OpPreview {
  summary: string;
  steps: string[];
  backup_note: string;
  warnings: string[];
}

export interface OpResult {
  ok: boolean;
  backup_path: string | null;
  applied_steps: string[];
  error: string | null;
}

// ---- Phase 3: editor ----

export interface SkillFile {
  file_path: string;
  content: string;
  enabled: boolean;
  editable: boolean;
  locked_reason: string | null;
}

export interface Issue {
  level: "error" | "warning";
  field: string;
  message: string;
}

export interface ValidationReport {
  ok: boolean;
  has_frontmatter: boolean;
  yaml_error: string | null;
  name: string | null;
  detected_format: "claude" | "codex" | "unknown";
  issues: Issue[];
}

export interface WriteResult {
  ok: boolean;
  backup_path: string | null;
  error: string | null;
}

// ---- Phase 4: cross-tool sync ----

export interface SyncRequest {
  source: string;
  target_tool: Tool;
}

export interface FieldMap {
  field: string;
  from: string;
  to: string;
  value: string | null;
}

export interface SyncPreview {
  ok: boolean;
  source_tool: string;
  target_tool: Tool;
  target_dir: string;
  target_skill_md: string;
  target_exists: boolean;
  body_status: "new" | "identical" | "differs";
  skill_md_diff: string;
  field_map: FieldMap[];
  openai_yaml: string | null;
  warnings: string[];
}

export interface SyncResult {
  ok: boolean;
  backup_path: string | null;
  written: string[];
  error: string | null;
}

// ---- Phase 5: custom categories (grouping) ----
// Mirrors src-tauri/src/groups.rs. Skills are keyed by aggregate `name`.

export interface GroupConfig {
  version: number;
  /** Ordered list of category names the user has defined. */
  categories: string[];
  /** skill name → categories it belongs to. */
  assignments: Record<string, string[]>;
}

/** How the skill list is partitioned into collapsible sections. */
export type GroupBy = "none" | "tool" | "scope" | "category";

export const SCOPE_LABELS: Record<Scope, string> = {
  "claude-user": "Claude 用户",
  shared: "共享池",
  "codex-user": "Codex 用户",
  project: "项目",
};
