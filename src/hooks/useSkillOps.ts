import { useCallback, useState } from "react";
import { previewOp, applyOp } from "../api";
import { type OpRequest } from "../types";
import { type Pending } from "../components/modals/ConfirmModal";
import { type FlowDeps } from "./types";

/**
 * Drives the enable/disable/promote/remove-link flow: build a preview
 * (requestOp), then apply on confirm and rescan. `busy` guards the modal's
 * confirm button while the write is in flight.
 */
export function useSkillOps({ setError, setToast, rescan }: FlowDeps) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

  const requestOp = useCallback(
    async (op: OpRequest) => {
      try {
        setPending({ op, preview: await previewOp(op) });
      } catch (e) {
        setError(String(e));
      }
    },
    [setError],
  );

  const confirmOp = useCallback(async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const res = await applyOp(pending.op);
      if (res.ok) {
        setToast(res.backup_path ? `已完成 · 备份于 ${res.backup_path}` : "已完成");
        setPending(null);
        await rescan();
      } else {
        setError(res.error ?? "操作失败");
        setPending(null);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [pending, setError, setToast, rescan]);

  const cancel = useCallback(() => setPending(null), []);

  return { pending, busy, requestOp, confirmOp, cancel };
}
