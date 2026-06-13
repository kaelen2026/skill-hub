/* ---- shared modal primitives ---- */
export function ModalShell({
  children,
  onCancel,
  wide,
}: {
  children: React.ReactNode;
  onCancel: () => void;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-5 backdrop-blur-[2px]"
      onClick={onCancel}
    >
      <div
        className={`max-h-[86vh] w-full overflow-y-auto rounded-md border border-line-2 bg-panel p-5 shadow-[0_24px_64px_rgba(0,0,0,0.55)] ${
          wide ? "max-w-[620px]" : "max-w-[460px]"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

// A labeled block inside a modal. (Named Field to avoid colliding with the
// `Section` skill-grouping type in lib/grouping.)
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3.5">
      <div className="eyebrow mb-1.5">{label}</div>
      {children}
    </div>
  );
}

export function Callout({ tone, children }: { tone: "shared" | "broken"; children: React.ReactNode }) {
  const color = tone === "broken" ? "var(--color-broken)" : "var(--color-shared)";
  return (
    <div
      className="mb-3.5 flex flex-col gap-0.5 rounded-sm px-3 py-2.5 text-[12px] leading-relaxed break-all"
      style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}
    >
      {children}
    </div>
  );
}

export function ModalActions({ children }: { children: React.ReactNode }) {
  return <div className="flex justify-end gap-2 pt-1">{children}</div>;
}
