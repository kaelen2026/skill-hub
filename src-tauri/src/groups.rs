//! Custom skill categories, persisted to ~/.skill-hub/groups.json.
//!
//! Categories are a purely organizational layer that lives *outside* the skills
//! themselves: assigning one never touches a SKILL.md (so Claude/Codex stay
//! unaware), and uninstalling a skill never loses the user's grouping. Skills
//! are keyed by aggregate `name` — the same identity the scanner groups by — so
//! every install of a skill shares its categories.
//!
//! Unlike `ops`/`editor`/`sync`, there is nothing destructive here: the file is
//! ours alone, tiny, and fully rewritten on every save. No backup dance needed.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroupConfig {
    #[serde(default = "default_version")]
    pub version: u32,
    /// Ordered list of category names the user has defined. Categories persist
    /// independently of assignments — an empty category is still selectable.
    #[serde(default)]
    pub categories: Vec<String>,
    /// skill name → the categories it belongs to.
    #[serde(default)]
    pub assignments: BTreeMap<String, Vec<String>>,
}

fn default_version() -> u32 {
    1
}

impl Default for GroupConfig {
    fn default() -> Self {
        Self {
            version: 1,
            categories: vec![],
            assignments: BTreeMap::new(),
        }
    }
}

fn home() -> PathBuf {
    dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"))
}

fn config_path() -> PathBuf {
    home().join(".skill-hub/groups.json")
}

/// Load the config, tolerating a missing or corrupt file by returning defaults
/// (grouping is non-critical — never block the app over it).
pub fn load() -> GroupConfig {
    load_from(&config_path())
}

/// Normalize, then atomically-ish rewrite the whole file.
pub fn save(config: &GroupConfig) -> io::Result<()> {
    save_to(&config_path(), config)
}

fn load_from(path: &Path) -> GroupConfig {
    match fs::read_to_string(path) {
        Ok(text) => serde_json::from_str(&text).unwrap_or_default(),
        Err(_) => GroupConfig::default(),
    }
}

fn save_to(path: &Path, config: &GroupConfig) -> io::Result<()> {
    let clean = normalize(config);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let text = serde_json::to_string_pretty(&clean).map_err(|e| io::Error::other(e.to_string()))?;
    fs::write(path, text)
}

/// Keep the on-disk file tidy: dedupe categories, drop assignments to unknown
/// categories, and prune skills left with no categories. The frontend sends
/// reasonable data, but normalizing here makes the file self-healing.
fn normalize(config: &GroupConfig) -> GroupConfig {
    let mut categories: Vec<String> = vec![];
    for c in &config.categories {
        let c = c.trim();
        if !c.is_empty() && !categories.iter().any(|e| e == c) {
            categories.push(c.to_string());
        }
    }

    let mut assignments = BTreeMap::new();
    for (skill, cats) in &config.assignments {
        let mut kept: Vec<String> = vec![];
        for c in cats {
            let c = c.trim();
            if categories.iter().any(|e| e == c) && !kept.iter().any(|e| e == c) {
                kept.push(c.to_string());
            }
        }
        if !kept.is_empty() {
            assignments.insert(skill.clone(), kept);
        }
    }

    GroupConfig {
        version: config.version.max(1),
        categories,
        assignments,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn tmpfile(tag: &str) -> PathBuf {
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir()
            .join(format!("skillhub-groups-{tag}-{ts}"))
            .join("groups.json")
    }

    #[test]
    fn load_missing_returns_default() {
        let cfg = load_from(Path::new("/nonexistent/skill-hub/groups.json"));
        assert_eq!(cfg.version, 1);
        assert!(cfg.categories.is_empty());
        assert!(cfg.assignments.is_empty());
    }

    #[test]
    fn save_then_load_roundtrips() {
        let path = tmpfile("roundtrip");
        let cfg = GroupConfig {
            categories: vec!["写作".into(), "调试".into()],
            assignments: BTreeMap::from([("write".into(), vec!["写作".into()])]),
            ..Default::default()
        };
        save_to(&path, &cfg).unwrap();

        let back = load_from(&path);
        assert_eq!(back.categories, vec!["写作", "调试"]);
        assert_eq!(back.assignments.get("write").unwrap(), &vec!["写作"]);

        fs::remove_dir_all(path.parent().unwrap()).ok();
    }

    #[test]
    fn normalize_dedupes_and_prunes() {
        let path = tmpfile("normalize");
        let cfg = GroupConfig {
            version: 1,
            // duplicate + blank category
            categories: vec!["写作".into(), "写作".into(), "  ".into(), "调试".into()],
            assignments: BTreeMap::from([
                // assigned to an unknown category → dropped → skill pruned
                ("ghost".into(), vec!["不存在".into()]),
                // duplicate kept once
                ("write".into(), vec!["写作".into(), "写作".into()]),
            ]),
        };
        save_to(&path, &cfg).unwrap();

        let back = load_from(&path);
        assert_eq!(back.categories, vec!["写作", "调试"]);
        assert!(!back.assignments.contains_key("ghost"));
        assert_eq!(back.assignments.get("write").unwrap(), &vec!["写作"]);

        fs::remove_dir_all(path.parent().unwrap()).ok();
    }

    #[test]
    fn corrupt_file_falls_back_to_default() {
        let path = tmpfile("corrupt");
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, "{ not valid json").unwrap();
        let cfg = load_from(&path);
        assert!(cfg.categories.is_empty());
        fs::remove_dir_all(path.parent().unwrap()).ok();
    }
}
