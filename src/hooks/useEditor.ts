import { useCallback, useState } from "react";
import { readSkillMd, readFile } from "../api";
import { type SkillInstance } from "../types";
import { type Editing } from "../Editor";
import { type FlowDeps } from "./types";

/**
 * Owns the in-app editor target. `openEditor` opens a SKILL.md with frontmatter
 * validation; `openFile` opens a bundled file (script/doc/asset) as raw text.
 * `onSaved` toasts, closes, and rescans to pick up the write.
 */
export function useEditor({ setError, setToast, rescan }: FlowDeps) {
  const [editing, setEditing] = useState<Editing | null>(null);

  const openEditor = useCallback(
    async (inst: SkillInstance) => {
      try {
        setEditing({ inst, file: await readSkillMd(inst.path), validate: true });
      } catch (e) {
        setError(String(e));
      }
    },
    [setError],
  );

  const openFile = useCallback(
    async (inst: SkillInstance, path: string) => {
      try {
        setEditing({ inst, file: await readFile(path), validate: false });
      } catch (e) {
        setError(String(e));
      }
    },
    [setError],
  );

  const onSaved = useCallback(
    (backupPath: string | null) => {
      setToast(backupPath ? `已保存 · 备份于 ${backupPath}` : "已保存");
      setEditing(null);
      rescan();
    },
    [setToast, rescan],
  );

  const close = useCallback(() => setEditing(null), []);

  return { editing, openEditor, openFile, onSaved, close };
}
