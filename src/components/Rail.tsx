/* ---- scope rail nav item ---- */
export function RailNav({
  icon,
  label,
  count,
  tone,
  active,
  collapsed,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  tone?: "drift" | "broken" | "shared";
  active?: boolean;
  collapsed?: boolean;
  onClick: () => void;
}) {
  const toneColor =
    tone === "drift"
      ? "var(--color-drift)"
      : tone === "broken"
        ? "var(--color-broken)"
        : tone === "shared"
          ? "var(--color-shared)"
          : undefined;
  return (
    <button
      onClick={onClick}
      title={collapsed ? `${label} · ${count}` : undefined}
      className={`group relative flex items-center rounded-sm py-1.5 text-left transition-colors ${
        collapsed ? "justify-center px-0" : "gap-2.5 px-2.5"
      } ${active ? "bg-surface-2 text-ink" : "text-dim hover:bg-surface hover:text-ink"}`}
    >
      <span
        className={`absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-accent transition-transform duration-150 ${
          active ? "scale-y-100" : "scale-y-0"
        }`}
      />
      <span
        style={{ color: active && toneColor ? toneColor : undefined }}
        className="relative flex-shrink-0"
      >
        {icon}
        {collapsed && count > 0 && (
          <span
            className="absolute -right-1.5 -top-1.5 min-w-[14px] rounded-full px-1 text-center text-[9px] font-semibold leading-[14px] tabular-nums"
            style={{
              background: toneColor ?? "var(--color-faint)",
              color: "var(--color-bg)",
            }}
          >
            {count}
          </span>
        )}
      </span>
      {!collapsed && (
        <>
          <span className="flex-1 text-[12.5px]">{label}</span>
          <span
            className="text-[12px] tabular-nums"
            style={{ color: count > 0 && toneColor ? toneColor : "var(--color-faint)" }}
          >
            {count}
          </span>
        </>
      )}
    </button>
  );
}
