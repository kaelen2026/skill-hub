/**
 * Shared dependencies for the write-flow hooks (ops / sync / editor): the
 * cross-cutting notification channel plus a rescan to refresh after a write.
 */
export interface FlowDeps {
  setError: (v: string | null) => void;
  setToast: (v: string) => void;
  rescan: (notify?: boolean) => Promise<void>;
}
