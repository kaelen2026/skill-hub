import { useCallback, useState } from "react";
import { previewSync, applySync } from "../api";
import { type SkillInstance, type Tool, type SyncRequest } from "../types";
import { type Syncing } from "../components/modals/SyncModal";
import { type FlowDeps } from "./types";

/**
 * Drives cross-tool sync: preview the projection Claude↔Codex (requestSync),
 * then write on confirm and rescan. `syncBusy` guards the confirm button.
 */
export function useSyncFlow({ setError, setToast, rescan }: FlowDeps) {
  const [syncing, setSyncing] = useState<Syncing | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);

  const requestSync = useCallback(
    async (inst: SkillInstance, targetTool: Tool) => {
      try {
        const req: SyncRequest = { source: inst.path, target_tool: targetTool };
        setSyncing({ req, preview: await previewSync(req) });
      } catch (e) {
        setError(String(e));
      }
    },
    [setError],
  );

  const confirmSync = useCallback(async () => {
    if (!syncing) return;
    setSyncBusy(true);
    try {
      const res = await applySync(syncing.req);
      if (res.ok) {
        setToast(
          res.backup_path
            ? `已同步 ${res.written.length} 个文件 · 备份于 ${res.backup_path}`
            : `已同步 ${res.written.length} 个文件`,
        );
        setSyncing(null);
        await rescan();
      } else {
        setError(res.error ?? "同步失败");
        setSyncing(null);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSyncBusy(false);
    }
  }, [syncing, setError, setToast, rescan]);

  const cancel = useCallback(() => setSyncing(null), []);

  return { syncing, syncBusy, requestSync, confirmSync, cancel };
}
