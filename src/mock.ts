// Browser-only mock data. Used when the app runs outside Tauri (e.g. `vite dev`
// in a plain browser for visual work), where `invoke` does not exist. Never used
// in the packaged app — see `isTauri()` in api.ts.

import type {
  ScanResult,
  SkillFile,
  ValidationReport,
  OpPreview,
  SyncPreview,
  GroupConfig,
} from "./types";

export const MOCK_SCAN: ScanResult = {
  scanned_roots: [
    "~/.claude/skills",
    "~/.agents/skills",
    "~/.codex/skills",
  ],
  total_instances: 11,
  groups: [
    {
      name: "design",
      tools: ["claude", "codex"],
      scopes: ["claude-user", "codex-user"],
      shared: false,
      drift: true,
      has_broken: false,
      instances: [
        {
          name: "design",
          path: "~/.claude/skills/design",
          skill_md_path: "~/.claude/skills/design/SKILL.md",
          scope: "claude-user",
          tool: "claude",
          kind: "directory",
          symlink_target: null,
          broken: false,
          is_system: false,
          enabled: true,
          description:
            "Produces distinctive, production-grade UI for pages, components, and screenshot-driven polish.",
          when_to_use:
            "设计/做页面/做组件/UI/前端/截图 or when a screen is ugly, unclear, or visually wrong.",
          short_description: "Distinctive, production-grade UI",
          body_hash: "a3f9c1d4e8b2",
          has_codex_companion: false,
          error: null,
        },
        {
          name: "design",
          path: "~/.codex/skills/design",
          skill_md_path: "~/.codex/skills/design/SKILL.md",
          scope: "codex-user",
          tool: "codex",
          kind: "directory",
          symlink_target: null,
          broken: false,
          is_system: false,
          enabled: true,
          description: "Produces distinctive, production-grade UI for pages and components.",
          when_to_use: "设计/做页面/做组件/UI/前端/截图",
          short_description: "Distinctive, production-grade UI",
          body_hash: "7c2e0a99f1b6",
          has_codex_companion: true,
          error: null,
        },
      ],
    },
    {
      name: "hunt",
      tools: ["claude"],
      scopes: ["claude-user"],
      shared: false,
      drift: false,
      has_broken: false,
      instances: [
        {
          name: "hunt",
          path: "~/.claude/skills/hunt",
          skill_md_path: "~/.claude/skills/hunt/SKILL.md",
          scope: "claude-user",
          tool: "claude",
          kind: "directory",
          symlink_target: null,
          broken: false,
          is_system: false,
          enabled: true,
          description:
            "Finds root cause before applying fixes for errors, crashes, regressions, and failing tests.",
          when_to_use: "排查/报错/崩溃/不工作/回归 or when something used to work and now fails.",
          short_description: "Root-cause before fixes",
          body_hash: "b1d8f3a07e44",
          has_codex_companion: false,
          error: null,
        },
      ],
    },
    {
      name: "check",
      tools: ["claude", "codex"],
      scopes: ["shared", "claude-user", "codex-user"],
      shared: true,
      drift: false,
      has_broken: false,
      instances: [
        {
          name: "check",
          path: "~/.agents/skills/check",
          skill_md_path: "~/.agents/skills/check/SKILL.md",
          scope: "shared",
          tool: "claude",
          kind: "directory",
          symlink_target: null,
          broken: false,
          is_system: false,
          enabled: true,
          description:
            "Reviews code diffs, PRs, issue queues, release readiness, and project audits with safety gates.",
          when_to_use: "review/看看代码/合并前/看看issue/PR/release/push",
          short_description: "Review diffs, PRs, releases",
          body_hash: "f04b6c2a1d90",
          has_codex_companion: false,
          error: null,
        },
        {
          name: "check",
          path: "~/.claude/skills/check",
          skill_md_path: "~/.claude/skills/check/SKILL.md",
          scope: "claude-user",
          tool: "claude",
          kind: "symlink",
          symlink_target: "~/.agents/skills/check",
          broken: false,
          is_system: false,
          enabled: true,
          description: "Reviews code diffs, PRs, issue queues, and release readiness.",
          when_to_use: "review/看看代码/合并前",
          short_description: "Review diffs, PRs, releases",
          body_hash: "f04b6c2a1d90",
          has_codex_companion: false,
          error: null,
        },
        {
          name: "check",
          path: "~/.codex/skills/check",
          skill_md_path: "~/.codex/skills/check/SKILL.md",
          scope: "codex-user",
          tool: "codex",
          kind: "directory",
          symlink_target: null,
          broken: false,
          is_system: false,
          enabled: false,
          description: "Reviews code diffs, PRs, issue queues, and release readiness.",
          when_to_use: "review/看看代码/合并前",
          short_description: "Review diffs, PRs, releases",
          body_hash: "f04b6c2a1d90",
          has_codex_companion: true,
          error: null,
        },
      ],
    },
    {
      name: "deep-research",
      tools: ["claude"],
      scopes: ["claude-user"],
      shared: false,
      drift: false,
      has_broken: true,
      instances: [
        {
          name: "deep-research",
          path: "~/.claude/skills/deep-research",
          skill_md_path: "~/.claude/skills/deep-research/SKILL.md",
          scope: "claude-user",
          tool: "claude",
          kind: "symlink",
          symlink_target: "~/.agents/skills/deep-research",
          broken: true,
          is_system: false,
          enabled: true,
          description: null,
          when_to_use: null,
          short_description: null,
          body_hash: null,
          has_codex_companion: false,
          error: "符号链接目标不存在：~/.agents/skills/deep-research",
        },
      ],
    },
    {
      name: "write",
      tools: ["codex"],
      scopes: ["codex-user"],
      shared: false,
      drift: false,
      has_broken: false,
      instances: [
        {
          name: "write",
          path: "~/.codex/skills/.system/write",
          skill_md_path: "~/.codex/skills/.system/write/SKILL.md",
          scope: "codex-user",
          tool: "codex",
          kind: "directory",
          symlink_target: null,
          broken: false,
          is_system: true,
          enabled: true,
          description:
            "Rewrites and polishes prose in Chinese or English, removes AI-like wording, reviews localization copy.",
          when_to_use: "帮我写/改稿/润色/去AI味/写一段/审稿/本地化文案",
          short_description: "Polish prose, de-AI copy",
          body_hash: "9e1c5b7d3a28",
          has_codex_companion: true,
          error: null,
        },
      ],
    },
    {
      name: "last30days",
      tools: ["claude"],
      scopes: ["claude-user"],
      shared: false,
      drift: false,
      has_broken: false,
      instances: [
        {
          name: "last30days",
          path: "~/.claude/skills/last30days",
          skill_md_path: "~/.claude/skills/last30days/SKILL.md",
          scope: "claude-user",
          tool: "claude",
          kind: "directory",
          symlink_target: null,
          broken: false,
          is_system: false,
          enabled: true,
          description:
            "Research what people actually say about any topic in the last 30 days across Reddit, X, YouTube, and HN.",
          when_to_use: null,
          short_description: "30-day social research",
          body_hash: "2a7f9013ce5b",
          has_codex_companion: false,
          error: null,
        },
      ],
    },
    {
      name: "think",
      tools: ["claude", "codex"],
      scopes: ["claude-user", "codex-user"],
      shared: false,
      drift: false,
      has_broken: false,
      instances: [
        {
          name: "think",
          path: "~/.claude/skills/think",
          skill_md_path: "~/.claude/skills/think/SKILL.md",
          scope: "claude-user",
          tool: "claude",
          kind: "directory",
          symlink_target: null,
          broken: false,
          is_system: false,
          enabled: true,
          description:
            "Turns rough ideas into approved, decision-complete plans with validated structure before coding.",
          when_to_use: "出方案/给方案/深入分析/怎么设计/有没有必要/值不值得",
          short_description: "Rough idea to approved plan",
          body_hash: "c5e2a8b1f730",
          has_codex_companion: false,
          error: null,
        },
        {
          name: "think",
          path: "~/.codex/skills/think",
          skill_md_path: "~/.codex/skills/think/SKILL.md",
          scope: "codex-user",
          tool: "codex",
          kind: "directory",
          symlink_target: null,
          broken: false,
          is_system: false,
          enabled: true,
          description: "Turns rough ideas into approved, decision-complete plans.",
          when_to_use: "出方案/给方案/深入分析",
          short_description: "Rough idea to approved plan",
          body_hash: "c5e2a8b1f730",
          has_codex_companion: true,
          error: null,
        },
      ],
    },
  ],
};

const MOCK_SKILL_MD = `---
name: design
description: Produces distinctive, production-grade UI for pages, components, and screenshot-driven polish.
when_to_use: 设计/做页面/做组件/UI/前端/截图
---

# Design: Build It With a Point of View

If it could have been generated by a default prompt, it is not good enough.

## Lock the Direction First

Before writing any code, name the audience, the aesthetic direction,
the design signature, the hard constraints, and the signature micro-interaction.
`;

export const MOCK_GROUPS: GroupConfig = {
  version: 1,
  categories: ["研究", "工程", "写作"],
  assignments: {
    "deep-research": ["研究"],
    last30days: ["研究"],
    hunt: ["工程"],
    check: ["工程"],
    think: ["工程", "研究"],
    write: ["写作"],
  },
};

export const MOCK_FILE: SkillFile = {
  file_path: "~/.claude/skills/design/SKILL.md",
  content: MOCK_SKILL_MD,
  enabled: true,
  editable: true,
  locked_reason: null,
};

export const MOCK_VALIDATION: ValidationReport = {
  ok: true,
  has_frontmatter: true,
  yaml_error: null,
  name: "design",
  detected_format: "claude",
  issues: [],
};

export const MOCK_OP_PREVIEW: OpPreview = {
  summary: "禁用 design（claude-user）",
  steps: [
    "重命名 ~/.claude/skills/design/SKILL.md → SKILL.md.disabled",
    "agent 将不再加载该 skill，内容完整保留",
  ],
  backup_note: "操作前整目录备份至 ~/.skill-hub/backups/<ts>/",
  warnings: [],
};

export const MOCK_SYNC_PREVIEW: SyncPreview = {
  ok: true,
  source_tool: "claude",
  target_tool: "codex",
  target_dir: "~/.codex/skills/design",
  target_skill_md: "~/.codex/skills/design/SKILL.md",
  target_exists: true,
  body_status: "differs",
  skill_md_diff: `---
-name: design
-description: Distinctive UI for pages and components.
+name: design
+description: Produces distinctive, production-grade UI for pages, components, and screenshot-driven polish.
 metadata:
+  when_to_use: 设计/做页面/做组件/UI/前端/截图
---`,
  field_map: [
    { field: "name", from: "name", to: "name", value: "design" },
    { field: "description", from: "description", to: "description", value: "Produces distinctive…" },
    { field: "triggers", from: "when_to_use", to: "metadata.when_to_use", value: "设计/做页面…" },
  ],
  openai_yaml: `interface:
  display_name: Design
  short_description: Distinctive, production-grade UI`,
  warnings: ["目标已存在，写入前会先备份整个目录"],
};
