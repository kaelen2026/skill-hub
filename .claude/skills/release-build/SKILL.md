---
name: release-build
description: >-
  Build the macOS distributable (.app + .dmg) for Skill Hub, Apple Silicon
  (arm64). Use when asked to 构建分发包/打包/出包/build the app/make a dmg/
  release build/分发/arm64 包/tauri build. Covers the cargo PATH gotcha, the
  target triple, artifact locations, and the adhoc-signing distribution caveat.
  Not for `tauri dev` (that's the run skill) or for the CI quality gate.
---

# Release build — macOS arm64 distributable

Produces a signed-for-local-use `.app` and `.dmg` for this Tauri app on Apple
Silicon. The whole thing is one command plus pre/post checks.

## Preconditions

1. **`cargo` is not on `PATH`.** rustup is installed via Homebrew with no
   `~/.cargo/bin` shim, so every Rust/Tauri command must be prefixed:

   ```bash
   PATH="$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin:$PATH" <cmd>
   ```

2. **arm64 target installed.** Confirm once:

   ```bash
   PATH="$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin:$PATH" \
     rustup target list --installed | grep aarch64-apple-darwin
   ```

   If missing: `rustup target add aarch64-apple-darwin`.

3. **Green tree first.** Run the quality gate before cutting a build so you
   don't bundle a broken state: `npm run verify` (fmt + clippy + test + tsc +
   vite build). The build's `beforeBuildCommand` already runs `npm run build`,
   but it does *not* run clippy/tests.

4. **Version** comes from `src-tauri/tauri.conf.json` (`version` field) — it
   ends up in the DMG filename (`skill-hub_<version>_aarch64.dmg`). Bump it
   there before building a new release.

## Build

Release compile + bundling takes a few minutes — **run it in the background**:

```bash
PATH="$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin:$PATH" \
  npm run tauri build -- --target aarch64-apple-darwin
```

`bundle.targets` is `"all"` in `tauri.conf.json`, so this emits both the `.app`
and the `.dmg`.

### If DMG bundling fails (`bundle_dmg.sh` error)

The `.app` builds fine but the DMG step can fail with:

```
failed to bundle project error running bundle_dmg.sh
```

Cause: Tauri's `bundle_dmg.sh` drives **Finder via AppleScript** to lay out the
disk-image window, which needs Automation permission. Headless / CLI / no-GUI-
automation environments (the same ones where `screencapture` lacks screen-
recording permission) don't have it, so the script aborts. It is *not* a compile
failure — the release binary and `.app` are already good.

Fallback: build a plain compressed DMG straight from the `.app` with `hdiutil`,
which needs no Finder automation. From the bundle dir:

```bash
cd src-tauri/target/aarch64-apple-darwin/release/bundle
hdiutil create -volname "skill-hub" \
  -srcfolder macos/skill-hub.app -ov -format UDZO \
  dmg/skill-hub_0.1.0_aarch64.dmg
```

This produces a working DMG (no styled "drag to Applications" window, but it
mounts and installs fine). Verify it: `hdiutil attach … -nobrowse` then `file`
the inner binary for `arm64`, then `hdiutil detach`. Reveal in Finder with
`open -R <dmg>`.

## Artifacts

Under `src-tauri/target/aarch64-apple-darwin/release/bundle/`:

| Artifact | Path |
|---|---|
| App bundle | `macos/skill-hub.app` |
| Disk image | `dmg/skill-hub_<version>_aarch64.dmg` |

## Verify the output

```bash
# Architecture must be arm64
file src-tauri/target/aarch64-apple-darwin/release/bundle/macos/skill-hub.app/Contents/MacOS/skill-hub

# Signing status
codesign -dv src-tauri/target/aarch64-apple-darwin/release/bundle/macos/skill-hub.app 2>&1 | grep -iE "Signature|Authority"
```

Expect `Mach-O 64-bit executable arm64` and `Signature=adhoc`.

## Distribution caveat (important)

The build is **adhoc-signed, not Developer-ID signed and not notarized.** That's
fine for local install on this machine, but anyone who downloads the DMG hits
Gatekeeper ("can't verify the developer"). Workarounds for the recipient:

- Right-click the app → **Open** (one-time override), or
- `xattr -dr com.apple.quarantine /path/to/skill-hub.app`

For real public distribution you need an Apple Developer ID certificate, then
sign + `notarytool` submit + staple. That is **not** wired up here — if the
request is "ship to other people," flag this gap instead of handing over the
adhoc DMG as if it were notarized.

## Notes

- Universal binary (arm64 + x86_64) is *not* what this SOP builds — it targets
  arm64 only. For Intel too, add `--target x86_64-apple-darwin` (needs that
  target installed) or build a universal bundle separately.
- Don't commit `target/` artifacts; they're build output.
