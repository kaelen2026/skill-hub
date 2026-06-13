#!/usr/bin/env node
// Drive the skill-hub frontend in a real browser and screenshot it.
//
// skill-hub is a Tauri (Rust + React) desktop app, but its frontend is the only
// part most PRs touch. `src/api.ts` serves mock data (src/mock.ts) whenever
// `__TAURI_INTERNALS__` is absent — i.e. in a plain browser — so the full React
// UI runs against `npm run dev` with zero Rust/Tauri/native-window involvement.
// This driver loads that dev server in headless system Chrome (via Playwright),
// drives the core flows, and writes screenshots you can open and inspect.
//
// Usage:  node .claude/skills/run-skill-hub/driver.mjs [--headed] [--out DIR]
//
// Exit 0 = every flow rendered and no console/page errors. Exit 1 = something
// broke (details printed). Screenshots land in --out (default /tmp/skill-hub-run).

import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const PROJECT = join(import.meta.dirname, "..", "..", "..");
const URL = "http://localhost:1420/";
const args = process.argv.slice(2);
const HEADED = args.includes("--headed");
const OUT = (() => {
  const i = args.indexOf("--out");
  return i >= 0 && args[i + 1] ? args[i + 1] : "/tmp/skill-hub-run";
})();

// ---- Playwright lives in the project OR the npx cache (it is not a project
// dep). Resolve from whichever exists; tell the user how to populate the cache
// if neither does. ----
function resolvePlaywright() {
  const candidates = [join(PROJECT, "node_modules", "playwright", "index.mjs")];
  const npx = join(homedir(), ".npm", "_npx");
  if (existsSync(npx)) {
    for (const h of readdirSync(npx)) {
      candidates.push(join(npx, h, "node_modules", "playwright", "index.mjs"));
    }
  }
  const hit = candidates.find((p) => existsSync(p));
  if (!hit) {
    throw new Error(
      "Playwright not found. Populate the npx cache once with:\n" +
        "  npx --yes playwright@1.60 --version",
    );
  }
  return pathToFileURL(hit).href;
}

async function serverUp() {
  try {
    const r = await fetch(URL, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}

// Reuse a running dev server if present (vite uses strictPort:1420 and refuses
// to start a second one). Otherwise start one and stop it on exit.
async function ensureServer() {
  if (await serverUp()) {
    console.log("• dev server already running on :1420 — reusing it");
    return null;
  }
  console.log("• starting `npm run dev`…");
  const proc = spawn("npm", ["run", "dev"], {
    cwd: PROJECT,
    detached: true,
    stdio: "ignore",
  });
  proc.unref();
  for (let i = 0; i < 60; i++) {
    if (await serverUp()) {
      console.log("• dev server is up");
      return proc;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  try {
    process.kill(-proc.pid, "SIGTERM");
  } catch {}
  throw new Error("dev server did not come up on :1420 within 30s");
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const { chromium } = await import(resolvePlaywright());
  const started = await ensureServer();

  const errors = [];
  const fails = [];
  const check = (label, ok, detail = "") => {
    console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
    if (!ok) fails.push(label);
  };

  // channel:"chrome" uses the system Google Chrome — no bundled-browser
  // download needed (we never call playwright install).
  const browser = await chromium.launch({ channel: "chrome", headless: !HEADED });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
    page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

    await page.goto(URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(800); // initial mock scan settles

    // 1) list renders (mock = 7 skills)
    const designVisible = await page.getByText("design", { exact: true }).first().isVisible().catch(() => false);
    check("list renders + 'design' row visible", designVisible);
    await page.screenshot({ path: join(OUT, "1-list.png") });

    // 2) select → detail pane (useScan result + Detail/InstanceCard)
    await page.getByText("design", { exact: true }).first().click();
    await page.waitForTimeout(300);
    const detail = await page.locator("h2", { hasText: "design" }).first().isVisible().catch(() => false);
    check("select skill → detail heading", detail);
    await page.screenshot({ path: join(OUT, "2-detail.png") });

    // 3) op flow → ConfirmModal (useSkillOps → previewOp mock)
    const opBtn = page.getByRole("button", { name: /禁用|启用/ }).first();
    let modal = false;
    if (await opBtn.count()) {
      await opBtn.click();
      await page.waitForTimeout(400);
      modal = await page.getByText(/将执行/).first().isVisible().catch(() => false);
      await page.screenshot({ path: join(OUT, "3-opmodal.png") });
      await page.getByRole("button", { name: "取消" }).first().click().catch(() => {});
      await page.waitForTimeout(200);
    }
    check("disable → confirm modal (useSkillOps)", modal);

    // 4) group by category (partition + SkillList sections)
    const grp = page.getByRole("button", { name: "分类", exact: true }).first();
    let grouped = false;
    if (await grp.count()) {
      await grp.click();
      await page.waitForTimeout(300);
      grouped = await page.getByText(/未分类|研究|工程|写作/).first().isVisible().catch(() => false);
      await page.screenshot({ path: join(OUT, "4-grouped.png") });
    }
    check("group by category → sections", grouped);

    // 5) search filter narrows the list
    const before = await page.locator("ul > li").count();
    await page.locator("input.field").first().fill("hunt");
    await page.waitForTimeout(300);
    const after = await page.locator("ul > li").count();
    check("search 'hunt' narrows list", after < before, `${before} → ${after} <li>`);
    await page.screenshot({ path: join(OUT, "5-search.png") });

    if (errors.length) {
      console.log("\nCONSOLE / PAGE ERRORS:");
      errors.forEach((e) => console.log("  " + e));
    } else {
      console.log("\nno console/page errors");
    }
  } finally {
    await browser.close();
    if (started) {
      try {
        process.kill(-started.pid, "SIGTERM");
        console.log("• stopped the dev server we started");
      } catch {}
    }
  }

  const ok = fails.length === 0 && errors.length === 0;
  console.log(`\n${ok ? "PASS" : "FAIL"} — screenshots in ${OUT}`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("driver error:", e.message);
  process.exit(1);
});
