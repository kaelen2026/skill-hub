---
name: run-skill-hub
description: >-
  Run, launch, drive, or screenshot the skill-hub desktop app to verify a change
  works. Use for "run skill-hub", "start the app", "screenshot the UI", "verify
  the frontend", or confirming a React/UI change renders without errors. Covers
  the browser-driven dev path (the one that's observable headless) and the full
  native Tauri path.
---

# Run skill-hub

skill-hub is a **Tauri (Rust + React/TS) desktop app**. Its frontend is what
nearly every PR touches, and `src/api.ts` serves mock data (`src/mock.ts`)
whenever `__TAURI_INTERNALS__` is absent — i.e. **in a plain browser**. So the
entire React UI runs against `npm run dev` with no Rust, no native window, and
no screen-recording permission needed. That browser path is the agent path; the
native Tauri window is the human path.

All paths below are relative to the repo root (`<unit>/` = the skill-hub repo).

## Prerequisites

- **Node** (built with v24) + the installed deps (`npm install` if `node_modules` is missing).
- **Google Chrome** installed (`/Applications/Google Chrome.app`) — the driver
  uses it via Playwright's `channel: "chrome"`, so no bundled-browser download.
- **Playwright** — *not* a project dep. The driver resolves it from the npx
  cache. Populate it once if missing:
  ```bash
  npx --yes playwright@1.60 --version
  ```

## Run — agent path (browser + screenshots)

One command. It detects/starts the dev server, drives the core flows in headless
Chrome, screenshots each, and exits non-zero on any failure or console error:

```bash
node .claude/skills/run-skill-hub/driver.mjs
```

Expected output (PASS, ~5s when the server is already up):

```
• dev server already running on :1420 — reusing it
  ✓ list renders + 'design' row visible
  ✓ select skill → detail heading
  ✓ disable → confirm modal (useSkillOps)
  ✓ group by category → sections
  ✓ search 'hunt' narrows list — 15 → 8 <li>
no console/page errors
PASS — screenshots in /tmp/skill-hub-run
```

Then **open the screenshots** in `/tmp/skill-hub-run/` (`1-list.png` …
`5-search.png`) and look at them — a blank or error frame is a failure even if
the checks pass. Flags: `--headed` (watch it run), `--out DIR` (screenshot dir).

The five flows map to the code most likely to break: `useScan`→list,
`Detail`/`InstanceCard`, `useSkillOps`→`ConfirmModal`, `partition`→sections,
search filter. Add a flow to `driver.mjs` when you touch something it misses.

## Run — human path (native Tauri window)

Full app against the **real** filesystem (`~/.claude/skills` etc.), real
enable/disable/sync writes. Note the cargo PATH prefix — rustup is installed via
Homebrew with no `~/.cargo/bin` shim, so `cargo` isn't on PATH otherwise:

```bash
PATH="$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin:$PATH" npm run tauri dev
```

A window opens; Ctrl-C to quit. Useless headless, and the native window can't be
screenshotted without screen-recording permission — use the agent path to
observe the UI, this only to exercise the real Rust/FS operations.

## Frontend typecheck + build (no app launch)

```bash
npm run build      # tsc --noEmit + vite build; the fast green/red signal
```

## Gotchas

- **Mock vs. real data.** The browser path always shows `src/mock.ts` (7 fixed
  skills: design/hunt/check/deep-research/write/last30days/think), never your
  real `~/.claude` skills. To see real data you must use the Tauri path. Don't
  file "my skill is missing" bugs against the browser path — it's mock by design.
- **Port 1420 is single-occupant.** `vite.config.ts` sets `strictPort: true`, so
  a second `npm run dev` dies with "Port 1420 is already in use." The driver
  handles this: it reuses an existing server and only stops one it started.
- **`ul > li` counts are noisy.** The rail's scanned-roots list and the detail
  pane's file list are also `<li>`, so absolute row counts exceed the 7 skills.
  Assert on visible text/relative change, not exact `<li>` counts.
- **Playwright path is a hashed npx-cache dir.** The driver globs
  `~/.npm/_npx/*/node_modules/playwright/index.mjs` rather than hardcoding the
  hash, since it changes per machine/version.

## Troubleshooting

- **`Playwright not found`** → run the `npx --yes playwright@1.60 --version` line
  above to populate the npx cache, then re-run the driver.
- **`dev server did not come up on :1420 within 30s`** → run `npm run dev`
  manually and read its output; usually a stale process holds 1420
  (`lsof -ti tcp:1420`) or `node_modules` needs `npm install`.
- **`npm run tauri dev` fails with cargo not found** → you dropped the PATH
  prefix; use the full line in the human-path section.
