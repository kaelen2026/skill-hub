mod editor;
mod groups;
mod ops;
mod scanner;
mod sync;

use editor::{SkillFile, ValidationReport, WriteResult};
use groups::GroupConfig;
use ops::{OpPreview, OpRequest, OpResult};
use scanner::ScanResult;
use sync::{SyncPreview, SyncRequest, SyncResult};

/// Phase 1 entry point: discover every skill install across all scopes.
/// `extra_roots` are optional project directories to also scan.
#[tauri::command]
fn scan_skills(extra_roots: Vec<String>) -> ScanResult {
    scanner::scan(&extra_roots)
}

/// Phase 2: describe what an op will do without touching disk.
#[tauri::command]
fn preview_op(op: OpRequest) -> OpPreview {
    ops::preview(&op)
}

/// Phase 2: back up, then perform the op.
#[tauri::command]
fn apply_op(op: OpRequest) -> OpResult {
    ops::apply(&op)
}

/// Phase 3: read the SKILL.md backing a skill dir.
#[tauri::command]
fn read_skill_md(dir: String) -> Result<SkillFile, String> {
    editor::read(&dir)
}

/// Read an arbitrary bundled file (script/doc/asset) for in-app editing.
#[tauri::command]
fn read_file(path: String) -> Result<SkillFile, String> {
    editor::read_file(&path)
}

/// Phase 3: validate raw SKILL.md text for a target tool.
#[tauri::command]
fn validate_skill_md(content: String, tool: String) -> ValidationReport {
    editor::validate(&content, &tool)
}

/// Phase 3: back up the dir, then overwrite the SKILL.md file.
#[tauri::command]
fn write_skill_md(file_path: String, content: String) -> WriteResult {
    editor::write(&file_path, &content)
}

/// Phase 4: preview projecting a skill to the other tool's conventions.
#[tauri::command]
fn preview_sync(req: SyncRequest) -> SyncPreview {
    sync::preview(&req)
}

/// Phase 4: back up the target, then write the projected SKILL.md (+ openai.yaml).
#[tauri::command]
fn apply_sync(req: SyncRequest) -> SyncResult {
    sync::apply(&req)
}

/// Read the user's custom category config (~/.skill-hub/groups.json).
/// Missing or corrupt files yield defaults — grouping never blocks the app.
#[tauri::command]
fn read_groups() -> GroupConfig {
    groups::load()
}

/// Persist the custom category config, normalizing it on the way to disk.
#[tauri::command]
fn write_groups(config: GroupConfig) -> Result<(), String> {
    groups::save(&config).map_err(|e| e.to_string())
}

/// Reveal a file or directory in Finder (`open -R`).
#[tauri::command]
fn reveal_in_finder(path: String) -> Result<(), String> {
    std::process::Command::new("open")
        .args(["-R", &path])
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// Open a path with its default application (e.g. SKILL.md in the editor).
#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    std::process::Command::new("open")
        .arg(&path)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            scan_skills,
            reveal_in_finder,
            open_path,
            preview_op,
            apply_op,
            read_skill_md,
            read_file,
            validate_skill_md,
            write_skill_md,
            preview_sync,
            apply_sync,
            read_groups,
            write_groups
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
