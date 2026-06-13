import { invoke } from "@tauri-apps/api/core";
import type {
  OpPreview,
  OpRequest,
  OpResult,
  ScanResult,
  SkillFile,
  ValidationReport,
  WriteResult,
  SyncRequest,
  SyncPreview,
  SyncResult,
} from "./types";
import {
  MOCK_SCAN,
  MOCK_FILE,
  MOCK_VALIDATION,
  MOCK_OP_PREVIEW,
  MOCK_SYNC_PREVIEW,
} from "./mock";

// True only inside the packaged Tauri app. In a plain browser (`vite dev` for
// visual work) `invoke` is absent, so we serve mock data instead of throwing.
const TAURI = "__TAURI_INTERNALS__" in window;

export function scanSkills(extraRoots: string[] = []): Promise<ScanResult> {
  if (!TAURI) return Promise.resolve(MOCK_SCAN);
  return invoke<ScanResult>("scan_skills", { extraRoots });
}

export function previewOp(op: OpRequest): Promise<OpPreview> {
  if (!TAURI) return Promise.resolve(MOCK_OP_PREVIEW);
  return invoke<OpPreview>("preview_op", { op });
}

export function applyOp(op: OpRequest): Promise<OpResult> {
  if (!TAURI)
    return Promise.resolve({ ok: true, backup_path: null, applied_steps: [], error: null });
  return invoke<OpResult>("apply_op", { op });
}

export function readSkillMd(dir: string): Promise<SkillFile> {
  if (!TAURI) return Promise.resolve(MOCK_FILE);
  return invoke<SkillFile>("read_skill_md", { dir });
}

export function validateSkillMd(content: string, tool: string): Promise<ValidationReport> {
  if (!TAURI) return Promise.resolve(MOCK_VALIDATION);
  return invoke<ValidationReport>("validate_skill_md", { content, tool });
}

export function writeSkillMd(filePath: string, content: string): Promise<WriteResult> {
  if (!TAURI) return Promise.resolve({ ok: true, backup_path: null, error: null });
  return invoke<WriteResult>("write_skill_md", { filePath, content });
}

export function previewSync(req: SyncRequest): Promise<SyncPreview> {
  if (!TAURI) return Promise.resolve(MOCK_SYNC_PREVIEW);
  return invoke<SyncPreview>("preview_sync", { req });
}

export function applySync(req: SyncRequest): Promise<SyncResult> {
  if (!TAURI)
    return Promise.resolve({ ok: true, backup_path: null, written: [], error: null });
  return invoke<SyncResult>("apply_sync", { req });
}

export function revealInFinder(path: string): Promise<void> {
  if (!TAURI) return Promise.resolve();
  return invoke("reveal_in_finder", { path });
}

export function openPath(path: string): Promise<void> {
  if (!TAURI) return Promise.resolve();
  return invoke("open_path", { path });
}
