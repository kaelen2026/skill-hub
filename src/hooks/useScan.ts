import { useCallback, useEffect, useState } from "react";
import { scanSkills } from "../api";
import { type ScanResult } from "../types";

/**
 * Owns the skill scan: result, loading flag, and the rescan entry point.
 * Runs an initial scan on mount. `rescan(true)` confirms with a toast and holds
 * the spinner briefly so a manual refresh reads as a deliberate action.
 */
export function useScan(setError: (v: string | null) => void, setToast: (v: string) => void) {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(false);

  const rescan = useCallback(
    async (notify = false) => {
      setLoading(true);
      setError(null);
      const started = performance.now();
      try {
        const res = await scanSkills();
        setResult(res);
        if (notify) {
          const elapsed = performance.now() - started;
          if (elapsed < 450) await new Promise((r) => setTimeout(r, 450 - elapsed));
          setToast(`已扫描 · ${res.groups.length} 个 skill · ${res.total_instances} 个实例`);
        }
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    },
    [setError, setToast],
  );

  useEffect(() => {
    rescan();
  }, [rescan]);

  return { result, loading, rescan };
}
