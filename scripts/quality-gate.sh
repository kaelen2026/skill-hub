#!/usr/bin/env sh
# Single source of truth for the quality gate. Called by the pre-commit hook
# (.husky/pre-commit) and by CI (.github/workflows/ci.yml) so both enforce the
# exact same checks. Any non-zero step fails the whole gate.
set -e

# Local dev: rustup installed via Homebrew has no ~/.cargo/bin shim, so the
# stable toolchain bin must be on PATH. This prepend is a harmless no-op in CI,
# where the dir does not exist and cargo is already on PATH.
export PATH="$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin:$PATH"

echo "▸ rustfmt --check"
( cd src-tauri && cargo fmt --check )

echo "▸ clippy (-D warnings)"
( cd src-tauri && cargo clippy --all-targets -- -D warnings )

echo "▸ cargo test"
( cd src-tauri && cargo test )

echo "▸ frontend typecheck + build"
npm run build

echo "✓ quality gate passed"
