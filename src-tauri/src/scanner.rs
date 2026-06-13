//! Phase 1: read-only discovery of skills across all known scopes.
//!
//! A "skill" is any directory containing a `SKILL.md`. The same skill may be
//! installed in several places (a real dir in one scope, a symlink in another).
//! We discover every *instance*, then aggregate instances that share a `name`
//! into a single group so the UI can show "one skill, N installs".

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

/// One physical install of a skill (one directory containing SKILL.md).
#[derive(Debug, Clone, Serialize)]
pub struct SkillInstance {
    /// Aggregation key: frontmatter `name`, falling back to the directory name.
    pub name: String,
    /// Absolute path to the skill directory.
    pub path: String,
    /// Absolute path to its SKILL.md.
    pub skill_md_path: String,
    /// "claude-user" | "shared" | "codex-user" | "project"
    pub scope: String,
    /// Which agent reads this dir: "claude" | "codex"
    pub tool: String,
    /// "directory" | "symlink"
    pub kind: String,
    /// Resolved symlink target, if `kind == "symlink"`.
    pub symlink_target: Option<String>,
    /// True if the symlink dangles or SKILL.md is missing/unreadable.
    pub broken: bool,
    /// True for Codex's bundled `.system/*` skills (read-only, official).
    pub is_system: bool,
    /// True when an active `SKILL.md` is present; false when it has been
    /// disabled (renamed to `SKILL.md.disabled`), so the agent ignores it.
    pub enabled: bool,
    pub description: Option<String>,
    pub when_to_use: Option<String>,
    pub short_description: Option<String>,
    /// sha256 of the markdown body (content after frontmatter). Drift key.
    pub body_hash: Option<String>,
    /// Codex companion file present (`agents/openai.yaml`).
    pub has_codex_companion: bool,
    /// Bundled files the skill ships alongside SKILL.md (scripts, references,
    /// assets, the openai.yaml companion, …). SKILL.md itself is excluded.
    pub files: Vec<SkillFileRef>,
    /// Non-fatal parse problem, surfaced instead of dropping the instance.
    pub error: Option<String>,
}

/// A file bundled inside a skill directory (the "referenced" files a SKILL.md
/// points at: scripts, reference docs, assets, the openai.yaml companion).
#[derive(Debug, Clone, Serialize)]
pub struct SkillFileRef {
    /// Path relative to the skill directory, '/'-separated.
    pub rel: String,
    /// Absolute path on disk.
    pub path: String,
    /// Size in bytes.
    pub size: u64,
}

/// All installs that share a `name`.
#[derive(Debug, Clone, Serialize)]
pub struct SkillGroup {
    pub name: String,
    pub instances: Vec<SkillInstance>,
    pub tools: Vec<String>,
    pub scopes: Vec<String>,
    /// More than one install, or installed via symlink → effectively shared.
    pub shared: bool,
    /// Distinct non-empty body hashes ⇒ the copies have diverged.
    pub drift: bool,
    pub has_broken: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScanResult {
    pub groups: Vec<SkillGroup>,
    /// Scope dirs that were scanned and actually existed.
    pub scanned_roots: Vec<String>,
    pub total_instances: usize,
}

struct Root {
    dir: PathBuf,
    scope: &'static str,
    tool: &'static str,
}

fn home() -> PathBuf {
    dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"))
}

/// The canonical home-level scopes, plus any caller-supplied project roots,
/// plus everything discovered by a full recursive sweep of `$HOME`. The fixed
/// home-level roots are listed first so dedup keeps their semantic scope label
/// (claude-user / shared / codex-user) when discovery re-finds the same dir.
fn build_roots(extra_roots: &[String]) -> Vec<Root> {
    let h = home();
    let mut roots = vec![
        Root {
            dir: h.join(".claude/skills"),
            scope: "claude-user",
            tool: "claude",
        },
        Root {
            dir: h.join(".agents/skills"),
            scope: "shared",
            tool: "claude",
        },
        Root {
            dir: h.join(".codex/skills"),
            scope: "codex-user",
            tool: "codex",
        },
    ];
    for r in extra_roots {
        let base = PathBuf::from(r);
        roots.push(Root {
            dir: base.join(".claude/skills"),
            scope: "project",
            tool: "claude",
        });
        roots.push(Root {
            dir: base.join(".codex/skills"),
            scope: "project",
            tool: "codex",
        });
    }

    // Full scan: find every `.claude|.codex|.agents/skills` dir anywhere under
    // home (project skills live in repos scattered across the disk).
    discover_skill_roots(&h, &mut roots);

    // Dedup by directory, keeping the first occurrence so the fixed home-level
    // scopes win over their project-labeled rediscovery.
    let mut seen = HashSet::new();
    roots.retain(|r| seen.insert(r.dir.clone()));
    roots
}

/// How deep the discovery sweep descends from `$HOME`. A project's skills dir
/// (`~/code/<org>/<repo>/.claude/skills`) sits only a handful of levels down;
/// the cap bounds cost and rules out pathological trees.
const MAX_DISCOVERY_DEPTH: usize = 12;

/// Directory names never worth descending: heavy build/vendor trees and caches
/// that can't contain a skill we care about. Keeps the sweep fast.
fn is_pruned_dir(name: &str) -> bool {
    matches!(
        name,
        "node_modules"
            | "target"
            | "dist"
            | "build"
            | "out"
            | "vendor"
            | "Pods"
            | "DerivedData"
            | "__pycache__"
            | "venv"
            | "Library"
            | "Applications"
            | "Caches"
            | ".git"
            | ".cache"
            | ".Trash"
            | ".venv"
            | ".next"
            | ".nuxt"
            | ".svelte-kit"
            | ".gradle"
            | ".m2"
    )
}

/// Recursively sweep `start` for skill roots, appending any found to `out`.
fn discover_skill_roots(start: &Path, out: &mut Vec<Root>) {
    discover_walk(start, 0, out);
}

fn discover_walk(dir: &Path, depth: usize, out: &mut Vec<Root>) {
    if depth >= MAX_DISCOVERY_DEPTH {
        return;
    }
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        // Use the dirent's own type: don't follow symlinks (avoids cycles and
        // escaping the home tree). Skip files outright.
        match entry.file_type() {
            Ok(t) if t.is_dir() => {}
            _ => continue,
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let p = entry.path();
        match name.as_str() {
            ".claude" => register_skill_dir(&p, "claude", out),
            ".codex" => register_skill_dir(&p, "codex", out),
            ".agents" => register_skill_dir(&p, "claude", out),
            _ => {
                // Don't descend into other hidden dirs or known-heavy trees.
                if name.starts_with('.') || is_pruned_dir(&name) {
                    continue;
                }
                discover_walk(&p, depth + 1, out);
            }
        }
    }
}

/// If `<dotdir>/skills` exists, register it as a project-scope root.
fn register_skill_dir(dotdir: &Path, tool: &'static str, out: &mut Vec<Root>) {
    let skills = dotdir.join("skills");
    if skills.is_dir() {
        out.push(Root {
            dir: skills,
            scope: "project",
            tool,
        });
    }
}

pub fn scan(extra_roots: &[String]) -> ScanResult {
    let roots = build_roots(extra_roots);
    let mut instances: Vec<SkillInstance> = Vec::new();
    let mut scanned_roots: Vec<String> = Vec::new();

    for root in &roots {
        if !root.dir.is_dir() {
            continue;
        }
        scanned_roots.push(root.dir.to_string_lossy().to_string());
        collect_from_dir(&root.dir, root.scope, root.tool, false, &mut instances);

        // Codex keeps its bundled skills one level deeper, in `.system/`.
        let system = root.dir.join(".system");
        if root.tool == "codex" && system.is_dir() {
            collect_from_dir(&system, root.scope, root.tool, true, &mut instances);
        }
    }

    ScanResult {
        total_instances: instances.len(),
        groups: aggregate(instances),
        scanned_roots,
    }
}

/// List immediate children of `dir`; each child holding a SKILL.md is a skill.
fn collect_from_dir(
    dir: &Path,
    scope: &str,
    tool: &str,
    is_system: bool,
    out: &mut Vec<SkillInstance>,
) {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let child = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();
        // Skip dotfiles/dirs like `.system` (handled separately) and `.DS_Store`.
        if file_name.starts_with('.') {
            continue;
        }
        // A child must resolve to a directory (real or via symlink) to be a skill.
        let link_meta = match fs::symlink_metadata(&child) {
            Ok(m) => m,
            Err(_) => continue,
        };
        let is_symlink = link_meta.file_type().is_symlink();
        if !is_symlink && !link_meta.is_dir() {
            continue;
        }

        let skill_md = child.join("SKILL.md");
        let disabled_md = child.join("SKILL.md.disabled");
        let target_exists = child.is_dir(); // follows symlinks
        let skill_md_present = skill_md.is_file();
        let disabled_present = disabled_md.is_file();
        // The file we actually read metadata from (prefer the active one).
        let source_md = if skill_md_present {
            &skill_md
        } else {
            &disabled_md
        };

        // Treat as a skill if an active OR disabled SKILL.md exists, OR it's a
        // dangling symlink we still want to surface as "broken".
        let dangling_symlink = is_symlink && !target_exists;
        let is_skill_candidate = skill_md_present || disabled_present || dangling_symlink;
        if !is_skill_candidate {
            continue;
        }

        let (symlink_target, kind) = if is_symlink {
            let t = fs::read_link(&child)
                .ok()
                .map(|p| {
                    // Resolve relative symlink targets against the link's parent.
                    if p.is_absolute() {
                        p
                    } else {
                        dir.join(p)
                    }
                })
                .and_then(|p| fs::canonicalize(&p).ok().or(Some(p)))
                .map(|p| p.to_string_lossy().to_string());
            (t, "symlink")
        } else {
            (None, "directory")
        };

        // "Broken" means we cannot read any SKILL.md content at all.
        let broken = (is_symlink && !target_exists) || (!skill_md_present && !disabled_present);
        let enabled = skill_md_present;

        let mut inst = SkillInstance {
            name: file_name.clone(),
            path: child.to_string_lossy().to_string(),
            // Point at the file that actually exists (disabled skills only
            // have SKILL.md.disabled), so "open" never targets a missing file.
            skill_md_path: source_md.to_string_lossy().to_string(),
            scope: scope.to_string(),
            tool: tool.to_string(),
            kind: kind.to_string(),
            symlink_target,
            broken,
            is_system,
            enabled,
            description: None,
            when_to_use: None,
            short_description: None,
            body_hash: None,
            has_codex_companion: child.join("agents/openai.yaml").is_file(),
            files: Vec::new(),
            error: None,
        };

        // List bundled files (everything but the SKILL.md). Skipped for broken
        // instances, where the directory/target isn't readable anyway.
        if !broken {
            inst.files = collect_skill_files(&child);
        }

        if skill_md_present || disabled_present {
            match parse_skill_md(source_md) {
                Ok(parsed) => {
                    if let Some(n) = parsed.name {
                        inst.name = n;
                    }
                    inst.description = parsed.description;
                    inst.when_to_use = parsed.when_to_use;
                    inst.short_description = parsed.short_description;
                    inst.body_hash = Some(parsed.body_hash);
                }
                Err(e) => inst.error = Some(e),
            }
        } else {
            inst.error = Some("SKILL.md missing (dangling symlink)".to_string());
        }

        out.push(inst);
    }
}

/// Cap so a pathological skill dir can't produce an unbounded list.
const MAX_SKILL_FILES: usize = 500;
/// Recursion bound. `fs::metadata` follows symlinks, so a self-referential or
/// cyclic directory symlink (e.g. `skill/loop -> skill`) would otherwise
/// recurse forever — and a cycle with no files never trips MAX_SKILL_FILES,
/// since that cap only fires once files are pushed. Real bundles are shallow.
const MAX_SKILL_DEPTH: usize = 16;

/// Recursively list files inside a skill directory, excluding the SKILL.md
/// itself, dotfiles, and dot-directories. Returned sorted by relative path.
fn collect_skill_files(skill_dir: &Path) -> Vec<SkillFileRef> {
    let mut out = Vec::new();
    walk_files(skill_dir, skill_dir, 0, &mut out);
    out.sort_by(|a, b| a.rel.cmp(&b.rel));
    out.truncate(MAX_SKILL_FILES);
    out
}

fn walk_files(base: &Path, dir: &Path, depth: usize, out: &mut Vec<SkillFileRef>) {
    if depth >= MAX_SKILL_DEPTH || out.len() >= MAX_SKILL_FILES {
        return;
    }
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        // Skip .DS_Store, .git, and other hidden cruft.
        if name.starts_with('.') {
            continue;
        }
        let p = entry.path();
        // Follow symlinks so a linked file/dir inside still resolves.
        let meta = match fs::metadata(&p) {
            Ok(m) => m,
            Err(_) => continue,
        };
        if meta.is_dir() {
            walk_files(base, &p, depth + 1, out);
        } else if meta.is_file() {
            let rel = p
                .strip_prefix(base)
                .unwrap_or(&p)
                .to_string_lossy()
                .replace('\\', "/");
            if rel == "SKILL.md" || rel == "SKILL.md.disabled" {
                continue;
            }
            out.push(SkillFileRef {
                rel,
                path: p.to_string_lossy().to_string(),
                size: meta.len(),
            });
        }
        if out.len() >= MAX_SKILL_FILES {
            return;
        }
    }
}

struct ParsedSkill {
    name: Option<String>,
    description: Option<String>,
    when_to_use: Option<String>,
    short_description: Option<String>,
    body_hash: String,
}

/// Parse the YAML frontmatter (between the first pair of `---` lines) and hash
/// the remaining markdown body. Tolerant: missing/extra keys never fail.
fn parse_skill_md(path: &Path) -> Result<ParsedSkill, String> {
    let raw = fs::read_to_string(path).map_err(|e| format!("read error: {e}"))?;
    let (frontmatter, body) = split_frontmatter(&raw);

    let mut name = None;
    let mut description = None;
    let mut when_to_use = None;
    let mut short_description = None;

    if let Some(fm) = frontmatter {
        if let Ok(val) = serde_yaml::from_str::<serde_yaml::Value>(fm) {
            name = str_field(&val, "name");
            description = str_field(&val, "description");
            // Claude: top-level `when_to_use`. Codex has no equivalent.
            when_to_use = str_field(&val, "when_to_use");
            // Short description lives in different places per tool:
            //   Claude: top-level `dispatch_intent`
            //   Codex:  metadata.short-description
            short_description = str_field(&val, "dispatch_intent").or_else(|| {
                val.get("metadata")
                    .and_then(|m| str_field(m, "short-description"))
            });
        }
    }

    let mut hasher = Sha256::new();
    hasher.update(body.trim().as_bytes());
    let body_hash = format!("{:x}", hasher.finalize());

    Ok(ParsedSkill {
        name,
        description,
        when_to_use,
        short_description,
        body_hash,
    })
}

fn str_field(val: &serde_yaml::Value, key: &str) -> Option<String> {
    val.get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// Returns (frontmatter_yaml, body). If no frontmatter, frontmatter is None and
/// body is the whole file.
fn split_frontmatter(raw: &str) -> (Option<&str>, &str) {
    let trimmed = raw.strip_prefix('\u{feff}').unwrap_or(raw); // tolerate BOM
    if let Some(rest) = trimmed
        .strip_prefix("---\n")
        .or_else(|| trimmed.strip_prefix("---\r\n"))
    {
        // Find the closing delimiter at the start of a line.
        if let Some(end) = find_closing_delim(rest) {
            let fm = &rest[..end.0];
            let body = &rest[end.1..];
            return (Some(fm), body);
        }
    }
    (None, raw)
}

/// Finds a line that is exactly `---`. Returns (byte offset where fm ends,
/// byte offset where body begins).
fn find_closing_delim(s: &str) -> Option<(usize, usize)> {
    let mut offset = 0usize;
    for line in s.split_inclusive('\n') {
        let stripped = line.trim_end_matches(['\n', '\r']);
        if stripped == "---" {
            return Some((offset, offset + line.len()));
        }
        offset += line.len();
    }
    None
}

fn aggregate(instances: Vec<SkillInstance>) -> Vec<SkillGroup> {
    let mut by_name: BTreeMap<String, Vec<SkillInstance>> = BTreeMap::new();
    for inst in instances {
        by_name.entry(inst.name.clone()).or_default().push(inst);
    }

    let mut groups: Vec<SkillGroup> = by_name
        .into_iter()
        .map(|(name, instances)| {
            let mut tools: Vec<String> = instances.iter().map(|i| i.tool.clone()).collect();
            tools.sort();
            tools.dedup();
            let mut scopes: Vec<String> = instances.iter().map(|i| i.scope.clone()).collect();
            scopes.sort();
            scopes.dedup();

            let has_broken = instances.iter().any(|i| i.broken);
            let shared = instances.len() > 1 || instances.iter().any(|i| i.kind == "symlink");

            // Drift: among non-broken instances, more than one distinct body hash.
            let mut hashes: Vec<&String> = instances
                .iter()
                .filter(|i| !i.broken)
                .filter_map(|i| i.body_hash.as_ref())
                .collect();
            hashes.sort();
            hashes.dedup();
            let drift = hashes.len() > 1;

            SkillGroup {
                name,
                instances,
                tools,
                scopes,
                shared,
                drift,
                has_broken,
            }
        })
        .collect();

    // Surface the interesting ones first: drift, broken, then shared, then name.
    groups.sort_by(|a, b| {
        let rank = |g: &SkillGroup| -> u8 {
            if g.drift {
                0
            } else if g.has_broken {
                1
            } else if g.shared {
                2
            } else {
                3
            }
        };
        rank(a)
            .cmp(&rank(b))
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    groups
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Smoke test against the real home dir. Prints what was found so we can
    /// eyeball that scopes, symlinks, and aggregation behave on live data.
    #[test]
    fn smoke_scan_home() {
        let r = scan(&[]);
        println!("\nscanned roots:");
        for root in &r.scanned_roots {
            println!("  {root}");
        }
        println!(
            "\n{} instances, {} unique skills:",
            r.total_instances,
            r.groups.len()
        );
        for g in &r.groups {
            let flags = [
                if g.drift { "DRIFT" } else { "" },
                if g.has_broken { "BROKEN" } else { "" },
                if g.shared { "SHARED" } else { "" },
            ]
            .iter()
            .filter(|s| !s.is_empty())
            .cloned()
            .collect::<Vec<_>>()
            .join(",");
            println!(
                "  {:18} tools={:?} scopes={:?} x{} {}",
                g.name,
                g.tools,
                g.scopes,
                g.instances.len(),
                flags
            );
            for inst in &g.instances {
                println!(
                    "      [{}] {} {}",
                    inst.kind,
                    inst.path,
                    inst.error.as_deref().unwrap_or("")
                );
            }
        }
        // We know at least the Claude user scope has skills on this machine.
        assert!(r.total_instances > 0, "expected to find some skills");
    }

    #[test]
    fn frontmatter_split_and_fields() {
        let sample = "---\nname: demo\ndescription: a test\nwhen_to_use: \"do X\"\ndispatch_intent: short\n---\n# Body\nhello\n";
        let (fm, body) = split_frontmatter(sample);
        assert!(fm.is_some());
        assert!(body.trim_start().starts_with("# Body"));
        let val: serde_yaml::Value = serde_yaml::from_str(fm.unwrap()).unwrap();
        assert_eq!(str_field(&val, "name").as_deref(), Some("demo"));
        assert_eq!(str_field(&val, "when_to_use").as_deref(), Some("do X"));
    }

    #[test]
    fn codex_metadata_short_description() {
        let sample =
            "---\nname: c\ndescription: d\nmetadata:\n  short-description: sd\n---\nbody\n";
        let (fm, _) = split_frontmatter(sample);
        let val: serde_yaml::Value = serde_yaml::from_str(fm.unwrap()).unwrap();
        let sd = val
            .get("metadata")
            .and_then(|m| str_field(m, "short-description"));
        assert_eq!(sd.as_deref(), Some("sd"));
    }

    #[test]
    fn discovery_finds_nested_roots_and_prunes() {
        let base = std::env::temp_dir().join("skillhub-discovery-test");
        let _ = fs::remove_dir_all(&base);
        // A real project skill a few levels down.
        let proj = base.join("code/org/repo/.claude/skills/foo");
        fs::create_dir_all(&proj).unwrap();
        fs::write(proj.join("SKILL.md"), "---\nname: foo\n---\nx").unwrap();
        // A skill buried in node_modules must be pruned, not discovered.
        let buried = base.join("code/org/repo/node_modules/pkg/.claude/skills/bar");
        fs::create_dir_all(&buried).unwrap();
        fs::write(buried.join("SKILL.md"), "---\nname: bar\n---\nx").unwrap();

        let mut roots = Vec::new();
        discover_skill_roots(&base, &mut roots);
        let dirs: Vec<String> = roots
            .iter()
            .map(|r| r.dir.to_string_lossy().into())
            .collect();

        assert!(
            dirs.iter().any(|d| d.ends_with("repo/.claude/skills")),
            "should discover the project skills dir, got {dirs:?}"
        );
        assert!(
            !dirs.iter().any(|d| d.contains("node_modules")),
            "node_modules must be pruned, got {dirs:?}"
        );
        assert!(roots.iter().all(|r| r.scope == "project"));
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn collect_files_survives_symlink_cycle() {
        // A directory symlink pointing back at its parent must not recurse
        // forever (it would abort the process, not panic).
        let dir = std::env::temp_dir().join("skillhub-cycle-test");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("real.txt"), "x").unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(&dir, dir.join("loop")).unwrap();

        let files = collect_skill_files(&dir);
        // Returns bounded results without hanging; the real file is present.
        assert!(files.len() <= MAX_SKILL_FILES);
        assert!(files.iter().any(|f| f.rel == "real.txt"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn no_frontmatter_is_tolerated() {
        let sample = "# Just a heading\nno frontmatter here\n";
        let (fm, body) = split_frontmatter(sample);
        assert!(fm.is_none());
        assert_eq!(body, sample);
    }
}
