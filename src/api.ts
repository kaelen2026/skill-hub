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

export function scanSkills(extraRoots: string[] = []): Promise<ScanResult> {
  return invoke<ScanResult>("scan_skills", { extraRoots });
}

export function previewOp(op: OpRequest): Promise<OpPreview> {
  return invoke<OpPreview>("preview_op", { op });
}

export function applyOp(op: OpRequest): Promise<OpResult> {
  return invoke<OpResult>("apply_op", { op });
}

export function readSkillMd(dir: string): Promise<SkillFile> {
  return invoke<SkillFile>("read_skill_md", { dir });
}

export function validateSkillMd(content: string, tool: string): Promise<ValidationReport> {
  return invoke<ValidationReport>("validate_skill_md", { content, tool });
}

export function writeSkillMd(filePath: string, content: string): Promise<WriteResult> {
  return invoke<WriteResult>("write_skill_md", { filePath, content });
}

export function previewSync(req: SyncRequest): Promise<SyncPreview> {
  return invoke<SyncPreview>("preview_sync", { req });
}

export function applySync(req: SyncRequest): Promise<SyncResult> {
  return invoke<SyncResult>("apply_sync", { req });
}

export function revealInFinder(path: string): Promise<void> {
  return invoke("reveal_in_finder", { path });
}

export function openPath(path: string): Promise<void> {
  return invoke("open_path", { path });
}
