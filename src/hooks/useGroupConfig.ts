import { useCallback, useEffect, useState } from "react";
import { readGroups, writeGroups } from "../api";
import { type GroupConfig } from "../types";

/**
 * Owns the category/grouping config (groups.json). Loads on mount; `mutate`
 * updates state optimistically then persists. groups.json is non-critical, so a
 * write failure only surfaces via onError — the in-memory state still applies.
 */
export function useGroupConfig(setError: (v: string | null) => void) {
  const [groupConfig, setGroupConfig] = useState<GroupConfig>({
    version: 1,
    categories: [],
    assignments: {},
  });

  useEffect(() => {
    readGroups().then(setGroupConfig).catch(() => {});
  }, []);

  const mutate = useCallback(
    (next: GroupConfig) => {
      setGroupConfig(next);
      writeGroups(next).catch((e) => setError(String(e)));
    },
    [setError],
  );

  return { groupConfig, mutate };
}
