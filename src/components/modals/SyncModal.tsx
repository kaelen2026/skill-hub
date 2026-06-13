import { ArrowLeftRight } from "lucide-react";
import { type SyncRequest, type SyncPreview } from "../../types";
import { ModalShell, Field, Callout, ModalActions } from "./ModalShell";

export interface Syncing {
  req: SyncRequest;
  preview: SyncPreview;
}

export function SyncModal({
  syncing,
  busy,
  onCancel,
  onConfirm,
}: {
  syncing: Syncing;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { preview: p } = syncing;
  const blocked = p.warnings.some(
    (w) => w.includes("拒绝") || w.includes("不支持") || w.includes("同一目录"),
  );
  const noChange = p.body_status === "identical";
  const statusLabel =
    p.body_status === "new" ? "新建" : p.body_status === "identical" ? "无变化" : "将覆盖（内容不同）";
  const statusColor =
    p.body_status === "new"
      ? "var(--color-shared)"
      : p.body_status === "identical"
        ? "var(--color-faint)"
        : "var(--color-drift)";

  return (
    <ModalShell onCancel={onCancel} wide>
      <h3 className="mb-1 flex items-center gap-2.5 text-[15px] font-semibold">
        <span>
          同步 {p.source_tool} <ArrowLeftRight className="inline" size={13} strokeWidth={2} />{" "}
          {p.target_tool}
        </span>
        <span
          className="rounded-sm px-2 py-0.5 text-[11px] font-medium"
          style={{ background: "color-mix(in srgb, " + statusColor + " 18%, transparent)", color: statusColor }}
        >
          {statusLabel}
        </span>
      </h3>
      <code className="code mb-3 block text-faint">{p.target_skill_md}</code>

      <Field label="字段映射">
        <table className="w-full border-collapse text-[12px]">
          <tbody>
            {p.field_map.map((f, i) => (
              <tr key={i} className="border-b border-line">
                <td className="py-1 pr-2 font-medium whitespace-nowrap">{f.field}</td>
                <td className="code py-1">{f.from}</td>
                <td className="px-2 text-center text-accent">→</td>
                <td className="code py-1">{f.to}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Field>

      {p.skill_md_diff && !noChange && (
        <Field label="SKILL.md diff">
          <pre className="max-h-[280px] overflow-auto rounded-sm border border-line bg-bg p-2.5 text-[11.5px] leading-[1.55] whitespace-pre-wrap break-all">
            {p.skill_md_diff.split("\n").map((line, i) => {
              const color = line.startsWith("+")
                ? "var(--color-accent)"
                : line.startsWith("-")
                  ? "var(--color-broken)"
                  : "var(--color-dim)";
              const bg = line.startsWith("+")
                ? "color-mix(in srgb, var(--color-accent) 11%, transparent)"
                : line.startsWith("-")
                  ? "color-mix(in srgb, var(--color-broken) 12%, transparent)"
                  : "transparent";
              return (
                <div key={i} style={{ color, background: bg }}>
                  {line || " "}
                </div>
              );
            })}
          </pre>
        </Field>
      )}

      {p.openai_yaml && (
        <Field label="将生成 agents/openai.yaml">
          <pre className="rounded-sm border border-line bg-bg p-2.5 text-[11.5px] leading-[1.55] whitespace-pre-wrap text-codex">
            {p.openai_yaml}
          </pre>
        </Field>
      )}

      {p.warnings.length > 0 && (
        <Callout tone={blocked ? "broken" : "shared"}>
          {p.warnings.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </Callout>
      )}
      {p.target_exists && !blocked && (
        <Callout tone="shared">目标已存在，写入前会先备份整个目录。</Callout>
      )}

      <ModalActions>
        <button className="btn" onClick={onCancel} disabled={busy}>
          取消
        </button>
        <button className="btn btn-go" onClick={onConfirm} disabled={busy || blocked || noChange}>
          {busy ? "同步中…" : "确认同步"}
        </button>
      </ModalActions>
    </ModalShell>
  );
}
