//! Phase 3: read / validate / write a skill's SKILL.md.
//!
//! Editing is raw-text (lossless): we never reserialize YAML, so comments,
//! key order, and unknown fields survive. Validation reuses the same
//! frontmatter parsing as the scanner and reports per-field issues without
//! blocking on anything but hard errors (missing frontmatter, bad YAML,
//! missing required fields).

use crate::ops;
use serde::Serialize;
use std::fs;
use std::path::Path;

#[derive(Debug, Serialize)]
pub struct SkillFile {
    /// The file actually backing this skill (SKILL.md or SKILL.md.disabled).
    pub file_path: String,
    pub content: String,
    pub enabled: bool,
    pub editable: bool,
    /// Reason it is not editable, if applicable (e.g. bundled system skill).
    pub locked_reason: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct Issue {
    /// "error" blocks save; "warning" is advisory.
    pub level: String,
    pub field: String,
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct ValidationReport {
    pub ok: bool,
    pub has_frontmatter: bool,
    pub yaml_error: Option<String>,
    pub name: Option<String>,
    pub detected_format: String,
    pub issues: Vec<Issue>,
}

#[derive(Debug, Serialize)]
pub struct WriteResult {
    pub ok: bool,
    pub backup_path: Option<String>,
    pub error: Option<String>,
}

fn is_system_path(path: &Path) -> bool {
    path.to_string_lossy().contains("/.codex/skills/.system/")
}

/// Resolve which file backs a skill dir and read it.
pub fn read(dir: &str) -> Result<SkillFile, String> {
    let d = Path::new(dir);
    let active = d.join("SKILL.md");
    let disabled = d.join("SKILL.md.disabled");
    let (file, enabled) = if active.is_file() {
        (active, true)
    } else if disabled.is_file() {
        (disabled, false)
    } else {
        return Err("没有可读取的 SKILL.md".into());
    };
    let content = fs::read_to_string(&file).map_err(|e| e.to_string())?;
    let system = is_system_path(&file);
    Ok(SkillFile {
        file_path: file.to_string_lossy().to_string(),
        content,
        enabled,
        editable: !system,
        locked_reason: if system {
            Some("Codex 内置技能，只读".into())
        } else {
            None
        },
    })
}

/// Validate raw SKILL.md text for the given target tool ("claude" | "codex").
pub fn validate(content: &str, tool: &str) -> ValidationReport {
    let (frontmatter, body) = split_frontmatter(content);
    let mut issues = vec![];

    let has_frontmatter = frontmatter.is_some();
    if !has_frontmatter {
        issues.push(Issue {
            level: "error".into(),
            field: "frontmatter".into(),
            message: "缺少 YAML frontmatter（文件需以 --- 开头并以 --- 结束）".into(),
        });
        return ValidationReport {
            ok: false,
            has_frontmatter,
            yaml_error: None,
            name: None,
            detected_format: "unknown".into(),
            issues,
        };
    }

    let fm = frontmatter.unwrap();
    let parsed: Result<serde_yaml::Value, _> = serde_yaml::from_str(fm);
    let val = match parsed {
        Ok(v) => v,
        Err(e) => {
            issues.push(Issue {
                level: "error".into(),
                field: "frontmatter".into(),
                message: format!("YAML 解析失败：{e}"),
            });
            return ValidationReport {
                ok: false,
                has_frontmatter,
                yaml_error: Some(e.to_string()),
                name: None,
                detected_format: "unknown".into(),
                issues,
            };
        }
    };

    let name = str_field(&val, "name");
    let description = str_field(&val, "description");
    let when_to_use = str_field(&val, "when_to_use");
    let metadata_short = val
        .get("metadata")
        .and_then(|m| str_field(m, "short-description"));
    let dispatch_intent = str_field(&val, "dispatch_intent");

    // Detect which tool's conventions this frontmatter follows.
    let detected_format = if when_to_use.is_some() || dispatch_intent.is_some() {
        "claude"
    } else if metadata_short.is_some() {
        "codex"
    } else {
        "unknown"
    }
    .to_string();

    // --- required fields (errors) ---
    match &name {
        None => issues.push(Issue {
            level: "error".into(),
            field: "name".into(),
            message: "缺少必填字段 name".into(),
        }),
        Some(n) => {
            if !is_kebab(n) {
                issues.push(Issue {
                    level: "warning".into(),
                    field: "name".into(),
                    message: "建议 name 使用 kebab-case（小写、连字符）".into(),
                });
            }
        }
    }
    if description.is_none() {
        issues.push(Issue {
            level: "error".into(),
            field: "description".into(),
            message: "缺少必填字段 description".into(),
        });
    }

    // --- tool-specific advisories (warnings) ---
    if tool == "claude" && when_to_use.is_none() {
        issues.push(Issue {
            level: "warning".into(),
            field: "when_to_use".into(),
            message: "Claude 用 when_to_use 做技能分发，建议补上触发词".into(),
        });
    }
    if tool == "codex" && metadata_short.is_none() {
        issues.push(Issue {
            level: "warning".into(),
            field: "metadata.short-description".into(),
            message: "Codex 用 metadata.short-description 作为短描述，建议补上".into(),
        });
    }

    if body.trim().is_empty() {
        issues.push(Issue {
            level: "warning".into(),
            field: "body".into(),
            message: "正文为空".into(),
        });
    }

    let ok = !issues.iter().any(|i| i.level == "error");
    ValidationReport {
        ok,
        has_frontmatter,
        yaml_error: None,
        name,
        detected_format,
        issues,
    }
}

/// Back up the skill dir, then overwrite the file with new content.
pub fn write(file_path: &str, content: &str) -> WriteResult {
    let file = Path::new(file_path);
    if is_system_path(file) {
        return WriteResult {
            ok: false,
            backup_path: None,
            error: Some("拒绝写入 Codex 内置技能（只读）".into()),
        };
    }
    let dir = match file.parent() {
        Some(d) => d,
        None => {
            return WriteResult {
                ok: false,
                backup_path: None,
                error: Some("无法定位 skill 目录".into()),
            }
        }
    };
    let backup = match ops::backup_dir(dir) {
        Ok(p) => p,
        Err(e) => {
            return WriteResult {
                ok: false,
                backup_path: None,
                error: Some(format!("备份失败，已中止写入：{e}")),
            }
        }
    };
    match fs::write(file, content) {
        Ok(_) => WriteResult {
            ok: true,
            backup_path: Some(backup.to_string_lossy().to_string()),
            error: None,
        },
        Err(e) => WriteResult {
            ok: false,
            backup_path: Some(backup.to_string_lossy().to_string()),
            error: Some(e.to_string()),
        },
    }
}

// ---- shared frontmatter helpers (mirror scanner's, kept local & tolerant) ----

fn str_field(val: &serde_yaml::Value, key: &str) -> Option<String> {
    val.get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn is_kebab(s: &str) -> bool {
    !s.is_empty()
        && s.chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

fn split_frontmatter(raw: &str) -> (Option<&str>, &str) {
    let trimmed = raw.strip_prefix('\u{feff}').unwrap_or(raw);
    if let Some(rest) = trimmed
        .strip_prefix("---\n")
        .or_else(|| trimmed.strip_prefix("---\r\n"))
    {
        let mut offset = 0usize;
        for line in rest.split_inclusive('\n') {
            let stripped = line.trim_end_matches(['\n', '\r']);
            if stripped == "---" {
                return (Some(&rest[..offset]), &rest[offset + line.len()..]);
            }
            offset += line.len();
        }
    }
    (None, raw)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_claude_skill_passes() {
        let c =
            "---\nname: my-skill\ndescription: does a thing\nwhen_to_use: when X\n---\n# Body\n";
        let r = validate(c, "claude");
        assert!(r.ok, "{:?}", r.issues);
        assert_eq!(r.detected_format, "claude");
        assert_eq!(r.name.as_deref(), Some("my-skill"));
    }

    #[test]
    fn missing_name_is_error() {
        let c = "---\ndescription: d\n---\nbody\n";
        let r = validate(c, "claude");
        assert!(!r.ok);
        assert!(r
            .issues
            .iter()
            .any(|i| i.field == "name" && i.level == "error"));
    }

    #[test]
    fn bad_yaml_is_error_not_panic() {
        let c = "---\nname: x\n  bad: : :\n---\nbody\n";
        let r = validate(c, "claude");
        assert!(!r.ok);
        assert!(r.yaml_error.is_some());
    }

    #[test]
    fn missing_frontmatter_is_error() {
        let r = validate("# just markdown\n", "claude");
        assert!(!r.ok);
        assert!(!r.has_frontmatter);
    }

    #[test]
    fn codex_format_detected_and_warns_for_claude() {
        let c = "---\nname: x\ndescription: d\nmetadata:\n  short-description: s\n---\nbody\n";
        let r = validate(c, "codex");
        assert!(r.ok);
        assert_eq!(r.detected_format, "codex");
        // For claude target, missing when_to_use should warn.
        let r2 = validate(c, "claude");
        assert!(r2.issues.iter().any(|i| i.field == "when_to_use"));
    }

    #[test]
    fn refuses_system_path() {
        let res = write(
            "/Users/x/.codex/skills/.system/foo/SKILL.md",
            "---\nname: a\ndescription: b\n---\nx",
        );
        assert!(!res.ok);
    }

    #[test]
    fn read_write_roundtrip() {
        let dir = std::env::temp_dir().join("skillhub-editor-test");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let original = "---\nname: t\ndescription: d\n---\nhello\n";
        fs::write(dir.join("SKILL.md"), original).unwrap();

        let f = read(dir.to_str().unwrap()).unwrap();
        assert!(f.enabled && f.editable);
        assert_eq!(f.content, original);

        let updated = "---\nname: t\ndescription: changed\nwhen_to_use: now\n---\nhello2\n";
        let res = write(&f.file_path, updated);
        assert!(res.ok, "{:?}", res.error);
        assert_eq!(fs::read_to_string(dir.join("SKILL.md")).unwrap(), updated);
        assert!(res.backup_path.is_some());

        let _ = fs::remove_dir_all(&dir);
    }
}
