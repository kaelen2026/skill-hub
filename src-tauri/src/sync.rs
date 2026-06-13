//! Phase 4: project a skill from one tool's conventions to the other.
//!
//! The body (everything after frontmatter) is canonical and copied verbatim.
//! Only the frontmatter is *projected*, because Claude and Codex diverge:
//!
//!   Claude SKILL.md            Codex SKILL.md                 Codex agents/openai.yaml
//!   ----------------           ---------------                ------------------------
//!   name                       name                           interface.display_name
//!   description                description                    —
//!   dispatch_intent            metadata.short-description     interface.short_description
//!   when_to_use                metadata.when_to_use (kept)    —
//!
//! `when_to_use` has no native Codex field, so we preserve it under a custom
//! `metadata.when_to_use` key rather than dropping it. Icons / default_prompt
//! are never fabricated — if the source has none, they are omitted.

use crate::ops;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Deserialize)]
pub struct SyncRequest {
    /// Source skill directory.
    pub source: String,
    /// "claude" | "codex"
    pub target_tool: String,
}

#[derive(Debug, Serialize)]
pub struct FieldMap {
    pub field: String,
    pub from: String,
    pub to: String,
    pub value: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SyncPreview {
    pub ok: bool,
    pub source_tool: String,
    pub target_tool: String,
    pub target_dir: String,
    pub target_skill_md: String,
    pub target_exists: bool,
    /// "new" | "identical" | "differs"
    pub body_status: String,
    /// Unified diff of the SKILL.md file (current target vs projected).
    pub skill_md_diff: String,
    pub field_map: Vec<FieldMap>,
    /// Generated companion file, only when target_tool == "codex".
    pub openai_yaml: Option<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct SyncResult {
    pub ok: bool,
    pub backup_path: Option<String>,
    pub written: Vec<String>,
    pub error: Option<String>,
}

fn home() -> PathBuf {
    dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"))
}

fn tool_skills_dir(tool: &str) -> Option<PathBuf> {
    match tool {
        "claude" => Some(home().join(".claude/skills")),
        "codex" => Some(home().join(".codex/skills")),
        _ => None,
    }
}

struct Source {
    tool: String,
    name: String,
    description: Option<String>,
    when_to_use: Option<String>,
    short_desc: Option<String>,
    body: String,
}

fn load_source(dir: &Path) -> Result<Source, String> {
    let active = dir.join("SKILL.md");
    let disabled = dir.join("SKILL.md.disabled");
    let file = if active.is_file() {
        active
    } else if disabled.is_file() {
        disabled
    } else {
        return Err("源目录没有 SKILL.md".into());
    };
    let raw = fs::read_to_string(&file).map_err(|e| e.to_string())?;
    let (fm, body) = split_frontmatter(&raw);
    let fm = fm.ok_or("源 SKILL.md 缺少 frontmatter")?;
    let val: serde_yaml::Value =
        serde_yaml::from_str(fm).map_err(|e| format!("源 frontmatter YAML 解析失败：{e}"))?;

    let name = str_field(&val, "name")
        .or_else(|| dir.file_name().map(|s| s.to_string_lossy().to_string()))
        .ok_or("源缺少 name")?;
    let when_to_use = str_field(&val, "when_to_use").or_else(|| {
        val.get("metadata")
            .and_then(|m| str_field(m, "when_to_use"))
    });
    let short_desc = str_field(&val, "dispatch_intent").or_else(|| {
        val.get("metadata")
            .and_then(|m| str_field(m, "short-description"))
    });
    // Detect which tool's conventions the source follows.
    let tool = if str_field(&val, "when_to_use").is_some()
        || str_field(&val, "dispatch_intent").is_some()
    {
        "claude"
    } else if val
        .get("metadata")
        .and_then(|m| str_field(m, "short-description"))
        .is_some()
    {
        "codex"
    } else {
        "claude" // default assumption
    }
    .to_string();

    Ok(Source {
        tool,
        name,
        description: str_field(&val, "description"),
        when_to_use,
        short_desc,
        body: body.to_string(),
    })
}

/// Build the projected SKILL.md text for the target tool.
fn project_skill_md(src: &Source, target_tool: &str) -> String {
    let mut out = String::from("---\n");
    out.push_str(&format!("name: {}\n", src.name));
    if let Some(d) = &src.description {
        out.push_str(&format!("description: {}\n", yaml_value(d)));
    }
    match target_tool {
        "codex" => {
            // Codex keeps short description + preserved triggers under metadata.
            if src.short_desc.is_some() || src.when_to_use.is_some() {
                out.push_str("metadata:\n");
                if let Some(s) = &src.short_desc {
                    out.push_str(&format!("  short-description: {}\n", yaml_value(s)));
                }
                if let Some(w) = &src.when_to_use {
                    out.push_str(&format!("  when_to_use: {}\n", yaml_value(w)));
                }
            }
        }
        _ => {
            // Claude uses top-level when_to_use + dispatch_intent.
            if let Some(w) = &src.when_to_use {
                out.push_str(&format!("when_to_use: {}\n", yaml_value(w)));
            }
            if let Some(s) = &src.short_desc {
                out.push_str(&format!("dispatch_intent: {}\n", yaml_value(s)));
            }
        }
    }
    out.push_str("---\n");
    // Canonical body, copied verbatim. Ensure exactly one leading newline gap.
    let body = src.body.trim_start_matches('\n');
    out.push_str(body);
    out
}

/// Build the Codex companion `agents/openai.yaml`. Icons / default_prompt are
/// never invented — only fields we can derive are written.
fn project_openai_yaml(src: &Source) -> String {
    let display = title_case(&src.name);
    let short = src
        .short_desc
        .clone()
        .or_else(|| src.description.clone())
        .unwrap_or_default();
    let mut out = String::from("interface:\n");
    out.push_str(&format!("  display_name: {}\n", yaml_value(&display)));
    if !short.is_empty() {
        out.push_str(&format!("  short_description: {}\n", yaml_value(&short)));
    }
    out
}

pub fn preview(req: &SyncRequest) -> SyncPreview {
    let mut warnings: Vec<String> = vec![];
    let src_dir = Path::new(&req.source);

    let target_dir_root = match tool_skills_dir(&req.target_tool) {
        Some(d) => d,
        None => {
            return blocked(
                &req.target_tool,
                vec![format!("不支持的目标工具：{}", req.target_tool)],
            )
        }
    };

    let src = match load_source(src_dir) {
        Ok(s) => s,
        Err(e) => return blocked(&req.target_tool, vec![e]),
    };

    if src.tool == req.target_tool {
        warnings.push("源与目标是同一个工具，通常无需同步".into());
    }

    let target_dir = target_dir_root.join(&src.name);
    let target_skill_md = target_dir.join("SKILL.md");
    let target_disabled = target_dir.join("SKILL.md.disabled");

    if target_dir
        .to_string_lossy()
        .contains("/.codex/skills/.system/")
    {
        return blocked(&req.target_tool, vec!["拒绝写入 Codex 内置技能目录".into()]);
    }
    if target_dir == src_dir {
        return blocked(&req.target_tool, vec!["目标与源是同一目录".into()]);
    }

    let projected = project_skill_md(&src, &req.target_tool);

    // Compare against whichever target file currently exists.
    let existing_file = if target_skill_md.is_file() {
        Some(target_skill_md.clone())
    } else if target_disabled.is_file() {
        Some(target_disabled.clone())
    } else {
        None
    };
    let target_exists = existing_file.is_some();
    let current = existing_file
        .as_ref()
        .and_then(|f| fs::read_to_string(f).ok())
        .unwrap_or_default();

    let body_status = if !target_exists {
        "new"
    } else if normalize(&current) == normalize(&projected) {
        "identical"
    } else {
        "differs"
    }
    .to_string();

    let skill_md_diff = unified_diff(&current, &projected);

    let field_map = build_field_map(&src, &req.target_tool);
    let openai_yaml = if req.target_tool == "codex" {
        Some(project_openai_yaml(&src))
    } else {
        None
    };

    if body_status == "identical" {
        warnings.push("目标内容与投影结果一致，无需写入".into());
    }

    SyncPreview {
        ok: warnings
            .iter()
            .all(|w| !w.contains("拒绝") && !w.contains("不支持")),
        source_tool: src.tool,
        target_tool: req.target_tool.clone(),
        target_dir: target_dir.to_string_lossy().to_string(),
        target_skill_md: target_skill_md.to_string_lossy().to_string(),
        target_exists,
        body_status,
        skill_md_diff,
        field_map,
        openai_yaml,
        warnings,
    }
}

pub fn apply(req: &SyncRequest) -> SyncResult {
    let pv = preview(req);
    // Hard blockers contain these markers; soft warnings (same tool, identical)
    // do not block — the user already saw them in the preview.
    if pv
        .warnings
        .iter()
        .any(|w| w.contains("拒绝") || w.contains("不支持") || w.contains("同一目录"))
    {
        return SyncResult {
            ok: false,
            backup_path: None,
            written: vec![],
            error: Some(pv.warnings.join("；")),
        };
    }

    let src = match load_source(Path::new(&req.source)) {
        Ok(s) => s,
        Err(e) => return err_result(e),
    };
    let target_dir = PathBuf::from(&pv.target_dir);

    // Back up the target dir if it already exists.
    let backup = if target_dir.exists() {
        match ops::backup_dir(&target_dir) {
            Ok(p) => Some(p.to_string_lossy().to_string()),
            Err(e) => return err_result(format!("备份目标失败，已中止：{e}")),
        }
    } else {
        None
    };

    if let Err(e) = fs::create_dir_all(&target_dir) {
        return err_result(format!("创建目标目录失败：{e}"));
    }

    let mut written = vec![];

    // Write SKILL.md (respect an existing disabled state: if target only had a
    // disabled file, keep it disabled).
    let active = target_dir.join("SKILL.md");
    let disabled = target_dir.join("SKILL.md.disabled");
    let dest = if !active.exists() && disabled.exists() {
        disabled
    } else {
        active
    };
    let projected = project_skill_md(&src, &req.target_tool);
    if let Err(e) = fs::write(&dest, &projected) {
        return err_result(format!("写入 SKILL.md 失败：{e}"));
    }
    written.push(dest.to_string_lossy().to_string());

    // Codex companion file.
    if req.target_tool == "codex" {
        let agents = target_dir.join("agents");
        if let Err(e) = fs::create_dir_all(&agents) {
            return err_result(format!("创建 agents 目录失败：{e}"));
        }
        let yaml_path = agents.join("openai.yaml");
        if let Err(e) = fs::write(&yaml_path, project_openai_yaml(&src)) {
            return err_result(format!("写入 openai.yaml 失败：{e}"));
        }
        written.push(yaml_path.to_string_lossy().to_string());
    }

    SyncResult {
        ok: true,
        backup_path: backup,
        written,
        error: None,
    }
}

fn build_field_map(src: &Source, target_tool: &str) -> Vec<FieldMap> {
    let mut m = vec![FieldMap {
        field: "name".into(),
        from: "name".into(),
        to: if target_tool == "codex" {
            "name + interface.display_name".into()
        } else {
            "name".into()
        },
        value: Some(src.name.clone()),
    }];
    if src.description.is_some() {
        m.push(FieldMap {
            field: "description".into(),
            from: "description".into(),
            to: "description".into(),
            value: src.description.clone(),
        });
    }
    if let Some(s) = &src.short_desc {
        m.push(FieldMap {
            field: "短描述".into(),
            from: if src.tool == "claude" {
                "dispatch_intent"
            } else {
                "metadata.short-description"
            }
            .into(),
            to: if target_tool == "codex" {
                "metadata.short-description + interface.short_description".into()
            } else {
                "dispatch_intent".into()
            },
            value: Some(s.clone()),
        });
    }
    if let Some(w) = &src.when_to_use {
        m.push(FieldMap {
            field: "触发词".into(),
            from: "when_to_use".into(),
            to: if target_tool == "codex" {
                "metadata.when_to_use（保留，Codex 无原生字段）".into()
            } else {
                "when_to_use".into()
            },
            value: Some(w.clone()),
        });
    }
    m
}

// ---- helpers ----------------------------------------------------------------

fn blocked(target_tool: &str, warnings: Vec<String>) -> SyncPreview {
    SyncPreview {
        ok: false,
        source_tool: "unknown".into(),
        target_tool: target_tool.to_string(),
        target_dir: String::new(),
        target_skill_md: String::new(),
        target_exists: false,
        body_status: "new".into(),
        skill_md_diff: String::new(),
        field_map: vec![],
        openai_yaml: None,
        warnings,
    }
}

fn err_result(e: impl Into<String>) -> SyncResult {
    SyncResult {
        ok: false,
        backup_path: None,
        written: vec![],
        error: Some(e.into()),
    }
}

fn normalize(s: &str) -> String {
    s.replace("\r\n", "\n").trim_end().to_string()
}

fn unified_diff(old: &str, new: &str) -> String {
    use similar::{ChangeTag, TextDiff};
    let diff = TextDiff::from_lines(old, new);
    let mut out = String::new();
    for change in diff.iter_all_changes() {
        let sign = match change.tag() {
            ChangeTag::Delete => "-",
            ChangeTag::Insert => "+",
            ChangeTag::Equal => " ",
        };
        out.push_str(sign);
        out.push_str(change.value());
        if !change.value().ends_with('\n') {
            out.push('\n');
        }
    }
    out
}

/// Quote a scalar for YAML using a double-quoted string (always safe).
fn yaml_value(s: &str) -> String {
    let escaped = s
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n");
    format!("\"{escaped}\"")
}

fn title_case(name: &str) -> String {
    name.split(['-', '_', ' '])
        .filter(|w| !w.is_empty())
        .map(|w| {
            let mut chars = w.chars();
            match chars.next() {
                Some(c) => c.to_uppercase().collect::<String>() + chars.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn str_field(val: &serde_yaml::Value, key: &str) -> Option<String> {
    val.get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
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

    fn claude_src() -> Source {
        Source {
            tool: "claude".into(),
            name: "my-skill".into(),
            description: Some("does a thing".into()),
            when_to_use: Some("when X happens".into()),
            short_desc: Some("Do the thing".into()),
            body: "# Heading\nbody text\n".into(),
        }
    }

    #[test]
    fn claude_to_codex_preserves_triggers_in_metadata() {
        let md = project_skill_md(&claude_src(), "codex");
        assert!(md.contains("name: my-skill"));
        assert!(md.contains("metadata:"));
        assert!(md.contains("short-description: \"Do the thing\""));
        assert!(
            md.contains("when_to_use: \"when X happens\""),
            "triggers must be preserved"
        );
        assert!(md.contains("# Heading"));
        // Must NOT carry Claude's top-level keys.
        assert!(!md.contains("\ndispatch_intent:"));
    }

    #[test]
    fn codex_companion_has_no_fabricated_icons() {
        let y = project_openai_yaml(&claude_src());
        assert!(y.contains("display_name: \"My Skill\""));
        assert!(y.contains("short_description: \"Do the thing\""));
        assert!(!y.contains("icon"), "icons must never be invented");
        assert!(!y.contains("default_prompt"));
    }

    #[test]
    fn codex_to_claude_maps_short_description() {
        let src = Source {
            tool: "codex".into(),
            name: "x".into(),
            description: Some("d".into()),
            when_to_use: None,
            short_desc: Some("short".into()),
            body: "body\n".into(),
        };
        let md = project_skill_md(&src, "claude");
        assert!(md.contains("dispatch_intent: \"short\""));
        assert!(!md.contains("metadata:"));
    }

    #[test]
    fn yaml_value_escapes_quotes() {
        assert_eq!(yaml_value("a \"b\" c"), "\"a \\\"b\\\" c\"");
    }

    #[test]
    fn title_case_basic() {
        assert_eq!(title_case("my-cool-skill"), "My Cool Skill");
    }

    #[test]
    fn full_roundtrip_to_temp_codex() {
        // Build a fake claude source, sync to a temp dir acting as target.
        let root = std::env::temp_dir().join("skillhub-sync-test");
        let _ = fs::remove_dir_all(&root);
        let src_dir = root.join("src/my-skill");
        fs::create_dir_all(&src_dir).unwrap();
        fs::write(
            src_dir.join("SKILL.md"),
            "---\nname: my-skill\ndescription: d\nwhen_to_use: w\ndispatch_intent: s\n---\n# B\nx\n",
        )
        .unwrap();

        let src = load_source(&src_dir).unwrap();
        assert_eq!(src.tool, "claude");
        let md = project_skill_md(&src, "codex");
        assert!(md.contains("metadata:") && md.contains("when_to_use: \"w\""));
        let y = project_openai_yaml(&src);
        assert!(y.contains("display_name"));

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn diff_marks_changes() {
        let d = unified_diff("a\nb\n", "a\nc\n");
        assert!(d.contains("-b"));
        assert!(d.contains("+c"));
        assert!(d.contains(" a"));
    }

    /// Read-only smoke test against a real installed Claude skill, if present.
    /// Verifies projection works on actual frontmatter without writing anything.
    #[test]
    fn smoke_preview_real_skill() {
        let home = dirs::home_dir().unwrap();
        let candidate = home.join(".claude/skills/write");
        if !candidate.join("SKILL.md").is_file() {
            eprintln!("(skipped: no ~/.claude/skills/write on this machine)");
            return;
        }
        let req = SyncRequest {
            source: candidate.to_string_lossy().to_string(),
            target_tool: "codex".into(),
        };
        let p = preview(&req);
        println!(
            "\nsource_tool={} target_exists={} body_status={}",
            p.source_tool, p.target_exists, p.body_status
        );
        println!("field_map: {} entries", p.field_map.len());
        if let Some(y) = &p.openai_yaml {
            println!("--- generated openai.yaml ---\n{y}");
        }
        assert_eq!(p.source_tool, "claude");
        assert!(
            p.openai_yaml.is_some(),
            "codex target must produce openai.yaml"
        );
        assert!(p.field_map.iter().any(|f| f.field == "name"));
        // `write` has a when_to_use, so it must be preserved into metadata.
        assert!(p.field_map.iter().any(|f| f.field == "触发词"));
    }
}
