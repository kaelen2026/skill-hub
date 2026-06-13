# Skill Hub — agent guide

Tauri (Rust + React/TS) macOS app for unified management of agent **skills** scattered
across Claude Code and Codex. A "skill" is any directory containing a `SKILL.md`.

## Build & verify

`cargo` is installed via Homebrew's `rustup` but there is **no `~/.cargo/bin` shim**, so
`cargo` is not on `PATH` by default. Prefix commands:

```bash
PATH="$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin:$PATH" <cmd>
```

- **Quality gate (the single entrypoint): `npm run verify`** → runs `scripts/quality-gate.sh`:
  `cargo fmt --check` + `cargo clippy --all-targets -D warnings` + `cargo test` + frontend `tsc`/`vite build`.
- Backend tests alone: `cd src-tauri && cargo test`
- Frontend typecheck/build alone: `npm run build` (runs `tsc` then `vite build`)
- Run the app: `npm run tauri dev` (GUI; needs the `PATH` prefix above)

The gate is enforced two ways, both calling `scripts/quality-gate.sh` (single source of truth):
- **pre-commit**: husky hook at `.husky/pre-commit` — every commit must pass the full gate.
- **CI**: `.github/workflows/ci.yml` on push/PR (macos runner, matches dev env).

Rust must stay `cargo fmt`-clean and `clippy -D warnings`-clean — the gate rejects any format
drift or clippy warning, not just test failures. Run `cargo fmt` before committing.

## Scope layout (where skills live)

| Scope | Path | Tool |
|-------|------|------|
| `claude-user` | `~/.claude/skills/` | Claude |
| `shared` | `~/.agents/skills/` | shared store (symlink target) |
| `codex-user` | `~/.codex/skills/` (incl. read-only `.system/*`) | Codex |
| `project` | `<root>/.claude\|.codex/skills/` | per extra scan roots |

Skills are aggregated by frontmatter `name` (fallback: dir name). Same name in multiple
places = one skill, multiple installs.

## Load-bearing invariant: one SKILL.md cannot losslessly serve both tools

The **body** (everything after frontmatter) is canonical and copied verbatim on sync.
Only **frontmatter is projected**, because the two tools diverge:

| Concept | Claude `SKILL.md` | Codex `SKILL.md` | Codex `agents/openai.yaml` |
|---------|-------------------|------------------|----------------------------|
| name | `name` | `name` | `interface.display_name` (title-cased) |
| description | `description` | `description` | — |
| short desc | `dispatch_intent` | `metadata.short-description` | `interface.short_description` |
| triggers | `when_to_use` | `metadata.when_to_use` (preserved) | — |

Rules the sync engine (`src-tauri/src/sync.rs`) must keep:
- `when_to_use` has **no native Codex field** → preserve under `metadata.when_to_use`, never drop it.
- **Never fabricate** `icon_*` / `default_prompt` in `openai.yaml`; omit when the source has none.
- Symlink-sharing works for Claude (it reads frontmatter directly) but **not** for Codex
  (different frontmatter + separate `openai.yaml`) — Codex installs are materialized copies.

## Safety rules for write operations

Every mutating op (`ops.rs`, `editor.rs`, `sync.rs`) is **preview → backup → apply**:
- Back up to `~/.skill-hub/backups/<unix-ts>/` before any overwrite/move/rename.
- `apply` re-runs `preview` and aborts if it found a blocking warning.
- `remove_link` **refuses to delete a real directory** (only removes symlinks).
- `write`/`sync` **refuse to touch `~/.codex/skills/.system/`** (bundled, read-only).
- Disable = rename `SKILL.md` ↔ `SKILL.md.disabled` (agents only load `SKILL.md`); content preserved, reversible.
- The editor is **raw-text / lossless** — never reserialize YAML (would drop comments, reorder keys, lose unknown fields).

## Module map

- `scanner.rs` — discover + parse + aggregate (read-only). `skill_md_path` must point at the
  file that actually exists (disabled skills only have `SKILL.md.disabled`).
- `ops.rs` — enable/disable, promote-to-shared, link/remove-link.
- `editor.rs` — read / validate / write SKILL.md.
- `sync.rs` — cross-tool projection + `openai.yaml` generation + unified diff.
