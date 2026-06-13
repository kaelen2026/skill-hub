import { type OpRequest, type OpPreview } from "../../types";
import { ModalShell, Field, Callout, ModalActions } from "./ModalShell";

export interface Pending {
  op: OpRequest;
  preview: OpPreview;
}

export function ConfirmModal({
  pending,
  busy,
  onCancel,
  onConfirm,
}: {
  pending: Pending;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const blocked = pending.preview.warnings.length > 0;
  return (
    <ModalShell onCancel={onCancel}>
      <h3 className="mb-3.5 text-[15px] font-semibold">{pending.preview.summary}</h3>
      <Field label="将执行">
        <ol className="flex list-decimal flex-col gap-1 pl-4 text-[12.5px] leading-relaxed marker:text-faint">
          {pending.preview.steps.map((s, i) => (
            <li key={i} className="break-all">
              {s}
            </li>
          ))}
        </ol>
      </Field>
      {pending.preview.backup_note && <Callout tone="shared">{pending.preview.backup_note}</Callout>}
      {blocked && (
        <Callout tone="broken">
          {pending.preview.warnings.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </Callout>
      )}
      <ModalActions>
        <button className="btn" onClick={onCancel} disabled={busy}>
          取消
        </button>
        <button className="btn btn-go" onClick={onConfirm} disabled={busy || blocked}>
          {busy ? "执行中…" : "确认执行"}
        </button>
      </ModalActions>
    </ModalShell>
  );
}
