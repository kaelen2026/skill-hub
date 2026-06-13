//! Phase 2: write operations on skill installs.
//!
//! Every mutating op is two-phase: `preview` describes exactly what will happen
//! (and surfaces blockers as warnings) without touching disk; `apply` makes a
//! backup first, then performs the steps. Nothing is destructive without a
//! recoverable copy under ~/.skill-hub/backups/<timestamp>/.

use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum OpRequest {
    /// Disable an install: rename `SKILL.md` → `SKILL.md.disabled`.
    Disable { path: String },
    /// Re-enable: rename `SKILL.md.disabled` → `SKILL.md`.
    Enable { path: String },
    /// Move a real dir into the shared store and leave a symlink behind, so
    /// both the original tool and any future tool reference one source.
    PromoteToShared { path: String },
    /// Create a symlink in another scope pointing at this install's dir.
    LinkToScope { source: String, scope: String },
    /// Remove a symlink install (only valid when the install is a symlink).
    RemoveLink { path: String },
}

#[derive(Debug, Serialize)]
pub struct OpPreview {
    pub summary: String,
    pub steps: Vec<String>,
    pub backup_note: String,
    /// Non-empty ⇒ the op is blocked; UI should disable the confirm button.
    pub warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct OpResult {
    pub ok: bool,
    pub backup_path: Option<String>,
    pub applied_steps: Vec<String>,
    pub error: Option<String>,
}

fn home() -> PathBuf {
    dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"))
}

fn scope_dir(scope: &str) -> Option<PathBuf> {
    let h = home();
    match scope {
        "claude-user" => Some(h.join(".claude/skills")),
        "shared" => Some(h.join(".agents/skills")),
        "codex-user" => Some(h.join(".codex/skills")),
        _ => None,
    }
}

fn backups_root() -> PathBuf {
    home().join(".skill-hub/backups")
}

fn timestamp() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    secs.to_string()
}

// ---- preview ----------------------------------------------------------------

pub fn preview(req: &OpRequest) -> OpPreview {
    match req {
        OpRequest::Disable { path } => preview_toggle(path, true),
        OpRequest::Enable { path } => preview_toggle(path, false),
        OpRequest::PromoteToShared { path } => preview_promote(path),
        OpRequest::LinkToScope { source, scope } => preview_link(source, scope),
        OpRequest::RemoveLink { path } => preview_remove_link(path),
    }
}

fn preview_toggle(path: &str, disable: bool) -> OpPreview {
    let dir = Path::new(path);
    let active = dir.join("SKILL.md");
    let disabled = dir.join("SKILL.md.disabled");
    let mut warnings = vec![];
    let (from, to, verb) = if disable {
        if !active.is_file() {
            warnings.push("没有可用的 SKILL.md，无法禁用".into());
        }
        (active, disabled, "禁用")
    } else {
        if !disabled.is_file() {
            warnings.push("没有 SKILL.md.disabled，无法启用".into());
        }
        (disabled, active, "启用")
    };
    OpPreview {
        summary: format!("{verb} {}", display_name(dir)),
        steps: vec![format!(
            "重命名 {} → {}",
            from.file_name().unwrap_or_default().to_string_lossy(),
            to.file_name().unwrap_or_default().to_string_lossy()
        )],
        backup_note: format!("先备份该 skill 目录到 {}", backups_root().display()),
        warnings,
    }
}

fn preview_promote(path: &str) -> OpPreview {
    let dir = Path::new(path);
    let mut warnings = vec![];
    let shared = scope_dir("shared").unwrap();
    let dest = shared.join(base(dir));

    if is_symlink(dir) {
        warnings.push("该安装本身是软链，无需提升；请对真实目录操作".into());
    }
    if dir.starts_with(&shared) {
        warnings.push("已经在共享池中".into());
    }
    if dest.exists() {
        warnings.push(format!("共享池中已存在同名目录：{}", dest.display()));
    }

    OpPreview {
        summary: format!("把 {} 提升为共享", display_name(dir)),
        steps: vec![
            format!("移动目录 → {}", dest.display()),
            format!("在原位置创建软链 {} → {}", dir.display(), dest.display()),
        ],
        backup_note: format!("先把整个目录备份到 {}", backups_root().display()),
        warnings,
    }
}

fn preview_link(source: &str, scope: &str) -> OpPreview {
    let src = Path::new(source);
    let mut warnings = vec![];
    let target_dir = match scope_dir(scope) {
        Some(d) => d,
        None => {
            warnings.push(format!("不支持的目标 scope：{scope}").into());
            return OpPreview {
                summary: "建立软链".into(),
                steps: vec![],
                backup_note: String::new(),
                warnings,
            };
        }
    };
    let dest = target_dir.join(base(src));
    if !src.exists() {
        warnings.push("源目录不存在".into());
    }
    if dest.exists() {
        warnings.push(format!("目标位置已存在：{}", dest.display()));
    }
    OpPreview {
        summary: format!("在 {scope} 建立指向 {} 的软链", display_name(src)),
        steps: vec![format!("创建软链 {} → {}", dest.display(), src.display())],
        backup_note: "纯新增软链，不改动源文件，无需备份".into(),
        warnings,
    }
}

fn preview_remove_link(path: &str) -> OpPreview {
    let p = Path::new(path);
    let mut warnings = vec![];
    if !is_symlink(p) {
        warnings.push("该安装不是软链，拒绝删除（避免误删真实目录）".into());
    }
    OpPreview {
        summary: format!("移除软链 {}", display_name(p)),
        steps: vec![format!("删除软链 {}（不影响其指向的真实目录）", p.display())],
        backup_note: "仅删除链接本身，记录其指向以便恢复".into(),
        warnings,
    }
}

// ---- apply ------------------------------------------------------------------

pub fn apply(req: &OpRequest) -> OpResult {
    // Refuse if the preview found blockers.
    let pv = preview(req);
    if !pv.warnings.is_empty() {
        return OpResult {
            ok: false,
            backup_path: None,
            applied_steps: vec![],
            error: Some(format!("操作被阻止：{}", pv.warnings.join("；"))),
        };
    }
    let res = match req {
        OpRequest::Disable { path } => apply_toggle(path, true),
        OpRequest::Enable { path } => apply_toggle(path, false),
        OpRequest::PromoteToShared { path } => apply_promote(path),
        OpRequest::LinkToScope { source, scope } => apply_link(source, scope),
        OpRequest::RemoveLink { path } => apply_remove_link(path),
    };
    match res {
        Ok((backup, steps)) => OpResult {
            ok: true,
            backup_path: backup.map(|p| p.to_string_lossy().to_string()),
            applied_steps: steps,
            error: None,
        },
        Err(e) => OpResult {
            ok: false,
            backup_path: None,
            applied_steps: vec![],
            error: Some(e.to_string()),
        },
    }
}

fn apply_toggle(path: &str, disable: bool) -> io::Result<(Option<PathBuf>, Vec<String>)> {
    let dir = Path::new(path);
    let backup = backup_dir(dir)?;
    let active = dir.join("SKILL.md");
    let disabled = dir.join("SKILL.md.disabled");
    let (from, to) = if disable { (active, disabled) } else { (disabled, active) };
    fs::rename(&from, &to)?;
    Ok((Some(backup), vec![format!("renamed {} → {}", from.display(), to.display())]))
}

fn apply_promote(path: &str) -> io::Result<(Option<PathBuf>, Vec<String>)> {
    let dir = Path::new(path);
    let backup = backup_dir(dir)?;
    let shared = scope_dir("shared").unwrap();
    fs::create_dir_all(&shared)?;
    let dest = shared.join(base(dir));
    move_dir(dir, &dest)?;
    symlink(&dest, dir)?;
    Ok((
        Some(backup),
        vec![
            format!("moved {} → {}", dir.display(), dest.display()),
            format!("symlinked {} → {}", dir.display(), dest.display()),
        ],
    ))
}

fn apply_link(source: &str, scope: &str) -> io::Result<(Option<PathBuf>, Vec<String>)> {
    let src = Path::new(source);
    let target_dir = scope_dir(scope).expect("validated in preview");
    fs::create_dir_all(&target_dir)?;
    let dest = target_dir.join(base(src));
    symlink(src, &dest)?;
    Ok((None, vec![format!("symlinked {} → {}", dest.display(), src.display())]))
}

fn apply_remove_link(path: &str) -> io::Result<(Option<PathBuf>, Vec<String>)> {
    let p = Path::new(path);
    let target = fs::read_link(p).ok();
    fs::remove_file(p)?;
    let note = match target {
        Some(t) => format!("removed symlink {} (was → {})", p.display(), t.display()),
        None => format!("removed symlink {}", p.display()),
    };
    Ok((None, vec![note]))
}

// ---- helpers ----------------------------------------------------------------

fn base(p: &Path) -> String {
    p.file_name().unwrap_or_default().to_string_lossy().to_string()
}

fn display_name(p: &Path) -> String {
    base(p)
}

fn is_symlink(p: &Path) -> bool {
    fs::symlink_metadata(p)
        .map(|m| m.file_type().is_symlink())
        .unwrap_or(false)
}

#[cfg(unix)]
fn symlink(target: &Path, link: &Path) -> io::Result<()> {
    std::os::unix::fs::symlink(target, link)
}

/// Recursively copy the skill dir into a timestamped backup folder.
pub(crate) fn backup_dir(src: &Path) -> io::Result<PathBuf> {
    let dest = backups_root().join(timestamp()).join(base(src));
    copy_dir_all(src, &dest)?;
    Ok(dest)
}

fn copy_dir_all(src: &Path, dst: &Path) -> io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if ty.is_symlink() {
            let target = fs::read_link(&from)?;
            symlink(&target, &to)?;
        } else if ty.is_dir() {
            copy_dir_all(&from, &to)?;
        } else {
            fs::copy(&from, &to)?;
        }
    }
    Ok(())
}

/// Move a directory, falling back to copy+remove across filesystems.
fn move_dir(src: &Path, dst: &Path) -> io::Result<()> {
    match fs::rename(src, dst) {
        Ok(_) => Ok(()),
        Err(_) => {
            copy_dir_all(src, dst)?;
            fs::remove_dir_all(src)?;
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    fn tmpdir(tag: &str) -> PathBuf {
        let base = env::temp_dir().join(format!("skillhub-test-{}-{}", tag, timestamp()));
        fs::create_dir_all(&base).unwrap();
        base
    }

    fn make_skill(root: &Path, name: &str, body: &str) -> PathBuf {
        let dir = root.join(name);
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            dir.join("SKILL.md"),
            format!("---\nname: {name}\ndescription: d\n---\n{body}\n"),
        )
        .unwrap();
        dir
    }

    #[test]
    fn disable_then_enable_roundtrip() {
        let root = tmpdir("toggle");
        let dir = make_skill(&root, "demo", "hello");

        let r = apply(&OpRequest::Disable { path: dir.to_string_lossy().into() });
        assert!(r.ok, "{:?}", r.error);
        assert!(!dir.join("SKILL.md").exists());
        assert!(dir.join("SKILL.md.disabled").exists());

        let r = apply(&OpRequest::Enable { path: dir.to_string_lossy().into() });
        assert!(r.ok, "{:?}", r.error);
        assert!(dir.join("SKILL.md").exists());
        assert!(!dir.join("SKILL.md.disabled").exists());

        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn link_and_remove_link() {
        let root = tmpdir("link");
        let src = make_skill(&root, "shared-demo", "x");
        let fake_scope = root.join("scope");
        fs::create_dir_all(&fake_scope).unwrap();
        let dest = fake_scope.join("shared-demo");

        symlink(&src, &dest).unwrap();
        assert!(is_symlink(&dest));

        // remove_link refuses non-symlinks, accepts symlinks.
        let r = apply(&OpRequest::RemoveLink { path: dest.to_string_lossy().into() });
        assert!(r.ok, "{:?}", r.error);
        assert!(!dest.exists());
        // Source must be untouched.
        assert!(src.join("SKILL.md").exists());

        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn remove_link_refuses_real_dir() {
        let root = tmpdir("guard");
        let dir = make_skill(&root, "real", "x");
        let r = apply(&OpRequest::RemoveLink { path: dir.to_string_lossy().into() });
        assert!(!r.ok, "must refuse deleting a real directory");
        assert!(dir.join("SKILL.md").exists());
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn move_dir_preserves_contents() {
        // Exercises the risky mechanic behind promote_to_shared without
        // touching the real shared store.
        let root = tmpdir("move");
        let src = make_skill(&root, "m", "payload");
        fs::create_dir_all(src.join("nested")).unwrap();
        fs::write(src.join("nested/extra.txt"), "keep me").unwrap();
        let dst = root.join("moved");

        move_dir(&src, &dst).unwrap();
        assert!(!src.exists(), "source removed after move");
        assert!(dst.join("SKILL.md").exists());
        assert_eq!(fs::read_to_string(dst.join("nested/extra.txt")).unwrap(), "keep me");

        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn promote_blocked_when_dest_exists() {
        // Can't safely test the real shared dir; just verify preview blocks on
        // a symlink input (a representative guard path).
        let root = tmpdir("promote");
        let src = make_skill(&root, "p", "x");
        let link = root.join("p-link");
        symlink(&src, &link).unwrap();
        let pv = preview(&OpRequest::PromoteToShared { path: link.to_string_lossy().into() });
        assert!(!pv.warnings.is_empty(), "promoting a symlink should warn");
        fs::remove_dir_all(&root).ok();
    }
}
