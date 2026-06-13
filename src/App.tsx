import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  RotateCw,
  Layers,
  GitCompare,
  TriangleAlert,
  Share2,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Moon,
} from "lucide-react";
import { type GroupBy } from "./types";
import { partition, GROUP_BY_OPTIONS } from "./lib/grouping";
import {
  assignCategory,
  unassignCategory,
  createCategory,
  deleteCategory,
} from "./lib/categories";
import { RailNav } from "./components/Rail";
import { SkillList } from "./components/SkillList";
import { Detail } from "./components/Detail";
import { Toast } from "./components/Toast";
import { ConfirmModal } from "./components/modals/ConfirmModal";
import { SyncModal } from "./components/modals/SyncModal";
import { useScan } from "./hooks/useScan";
import { useGroupConfig } from "./hooks/useGroupConfig";
import { useSkillOps } from "./hooks/useSkillOps";
import { useSyncFlow } from "./hooks/useSyncFlow";
import { useEditor } from "./hooks/useEditor";
import "./App.css";

// CodeMirror lives behind this lazy boundary so it stays out of the launch bundle.
const Editor = lazy(() => import("./Editor"));

type Filter = "all" | "drift" | "broken" | "shared";

function App() {
  // Cross-cutting notification channel, shared by every data flow below.
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // ---- data logic (see src/hooks) ----
  const { result, loading, rescan } = useScan(setError, setToast);
  const { groupConfig, mutate: mutateGroups } = useGroupConfig(setError);
  const { pending, busy, requestOp, confirmOp, cancel: cancelOp } = useSkillOps({
    setError,
    setToast,
    rescan,
  });
  const { syncing, syncBusy, requestSync, confirmSync, cancel: cancelSync } = useSyncFlow({
    setError,
    setToast,
    rescan,
  });
  const { editing, openEditor, openFile, onSaved, close: closeEditor } = useEditor({
    setError,
    setToast,
    rescan,
  });

  // ---- view state (search / selection / layout / grouping) ----
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [railCollapsed, setRailCollapsed] = useState(
    () => localStorage.getItem("rail-collapsed") === "1",
  );
  const [listPct, setListPct] = useState(() => {
    const v = Number(localStorage.getItem("list-pct"));
    return v >= 25 && v <= 75 ? v : 50;
  });
  const splitRef = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
  });
  const [groupBy, setGroupBy] = useState<GroupBy>(
    () => (localStorage.getItem("group-by") as GroupBy) || "none",
  );
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    localStorage.setItem("rail-collapsed", railCollapsed ? "1" : "0");
  }, [railCollapsed]);

  useEffect(() => {
    localStorage.setItem("list-pct", String(Math.round(listPct)));
  }, [listPct]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("group-by", groupBy);
  }, [groupBy]);

  // Drag the divider between the list and detail panes to rebalance them.
  function startSplitDrag(e: React.MouseEvent) {
    e.preventDefault();
    function onMove(ev: MouseEvent) {
      const rect = splitRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setListPct(Math.max(25, Math.min(75, pct)));
    }
    function onUp() {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function toggleSection(key: string) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const groups = result?.groups ?? [];

  const counts = useMemo(
    () => ({
      total: groups.length,
      drift: groups.filter((g) => g.drift).length,
      broken: groups.filter((g) => g.has_broken).length,
      shared: groups.filter((g) => g.shared).length,
    }),
    [groups],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups.filter((g) => {
      if (filter === "drift" && !g.drift) return false;
      if (filter === "broken" && !g.has_broken) return false;
      if (filter === "shared" && !g.shared) return false;
      if (!q) return true;
      const hay = [
        g.name,
        ...g.instances.map((i) => i.description ?? ""),
        ...g.instances.map((i) => i.when_to_use ?? ""),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [groups, query, filter]);

  const sections = useMemo(
    () => partition(visible, groupBy, groupConfig),
    [visible, groupBy, groupConfig],
  );

  // Flat selection order for keyboard nav, honoring collapsed sections so the
  // arrows skip hidden rows. De-duped because a skill may appear in several
  // category sections.
  const orderedNames = useMemo(() => {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const s of sections) {
      if (collapsedSections.has(s.key)) continue;
      for (const g of s.items) {
        if (seen.has(g.name)) continue;
        seen.add(g.name);
        names.push(g.name);
      }
    }
    return names;
  }, [sections, collapsedSections]);

  const selectedGroup = useMemo(
    () => groups.find((g) => g.name === selected) ?? null,
    [groups, selected],
  );

  // Keyboard nav: arrow keys move selection through the visible list, like a TUI.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (pending || editing || syncing) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      if (orderedNames.length === 0) return;
      e.preventDefault();
      const idx = orderedNames.indexOf(selected ?? "");
      const next =
        e.key === "ArrowDown"
          ? Math.min(orderedNames.length - 1, idx + 1)
          : Math.max(0, idx < 0 ? 0 : idx - 1);
      setSelected(orderedNames[next] ?? null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [orderedNames, selected, pending, editing, syncing]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg text-ink">
      {/* ---- command bar ---- */}
      <header className="flex h-11 flex-shrink-0 items-center gap-3 border-b border-line bg-rail px-3.5">
        <button
          className="icon-btn"
          onClick={() => setRailCollapsed((c) => !c)}
          title={railCollapsed ? "展开侧边栏" : "收起侧边栏"}
          aria-label={railCollapsed ? "展开侧边栏" : "收起侧边栏"}
        >
          {railCollapsed ? (
            <PanelLeftOpen size={15} strokeWidth={1.75} />
          ) : (
            <PanelLeftClose size={15} strokeWidth={1.75} />
          )}
        </button>
        <div className="flex items-center gap-2 pr-1">
          <span className="text-[15px] leading-none text-accent">◆</span>
          <span className="text-[13px] font-semibold tracking-tight">skill-hub</span>
        </div>
        <div className="relative ml-auto flex max-w-[440px] flex-1 items-center">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 text-faint"
            strokeWidth={1.75}
          />
          <input
            className="field w-full py-1.5 pl-8 pr-2.5"
            placeholder="搜索 skill / 描述 / 触发词…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button
          className="icon-btn"
          onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          title={theme === "dark" ? "切换到亮色" : "切换到暗色"}
          aria-label={theme === "dark" ? "切换到亮色" : "切换到暗色"}
        >
          {theme === "dark" ? (
            <Sun size={15} strokeWidth={1.75} />
          ) : (
            <Moon size={15} strokeWidth={1.75} />
          )}
        </button>
        <button
          className="icon-btn"
          onClick={() => rescan(true)}
          disabled={loading}
          title="重新扫描"
          aria-label="重新扫描"
        >
          <RotateCw size={15} strokeWidth={1.75} className={loading ? "animate-spin" : ""} />
        </button>
      </header>

      {error && (
        <div
          className="flex cursor-pointer items-center gap-2 border-b border-line bg-[color-mix(in_srgb,var(--color-broken)_14%,transparent)] px-4 py-2 text-[12.5px] text-broken"
          onClick={() => setError(null)}
        >
          <TriangleAlert size={14} strokeWidth={1.75} />
          <span className="flex-1">{error}</span>
          <span className="text-faint">点击关闭</span>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* ---- scope rail ---- */}
        <nav
          className={`flex flex-shrink-0 flex-col border-r border-line bg-rail transition-[width] duration-200 ${
            railCollapsed ? "w-[52px]" : "w-[212px]"
          }`}
        >
          {!railCollapsed && (
            <div className="px-3 pb-1 pt-3">
              <span className="eyebrow">视图</span>
            </div>
          )}
          <div className={`flex flex-col gap-0.5 px-2 ${railCollapsed ? "pt-5" : ""}`}>
            <RailNav
              icon={<Layers size={15} strokeWidth={1.75} />}
              label="全部"
              count={counts.total}
              active={filter === "all"}
              collapsed={railCollapsed}
              onClick={() => setFilter("all")}
            />
            <RailNav
              icon={<GitCompare size={15} strokeWidth={1.75} />}
              label="内容漂移"
              count={counts.drift}
              tone="drift"
              active={filter === "drift"}
              collapsed={railCollapsed}
              onClick={() => setFilter(filter === "drift" ? "all" : "drift")}
            />
            <RailNav
              icon={<TriangleAlert size={15} strokeWidth={1.75} />}
              label="损坏"
              count={counts.broken}
              tone="broken"
              active={filter === "broken"}
              collapsed={railCollapsed}
              onClick={() => setFilter(filter === "broken" ? "all" : "broken")}
            />
            <RailNav
              icon={<Share2 size={15} strokeWidth={1.75} />}
              label="共享 / 多处"
              count={counts.shared}
              tone="shared"
              active={filter === "shared"}
              collapsed={railCollapsed}
              onClick={() => setFilter(filter === "shared" ? "all" : "shared")}
            />
          </div>

          {!railCollapsed && (
            <div className="mt-4 px-3">
              <div className="eyebrow mb-1.5">分组方式</div>
              <div className="grid grid-cols-2 gap-1">
                {GROUP_BY_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => setGroupBy(o.value)}
                    className={`rounded-sm px-2 py-1 text-[11.5px] transition-colors ${
                      groupBy === o.value
                        ? "bg-accent/15 text-accent"
                        : "text-dim hover:bg-surface hover:text-ink"
                    }`}
                    style={
                      groupBy === o.value
                        ? { color: "var(--color-accent)", background: "color-mix(in srgb, var(--color-accent) 15%, transparent)" }
                        : undefined
                    }
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!railCollapsed && (
            <div className="mt-auto border-t border-line px-3 py-3">
              <div className="eyebrow mb-1.5">扫描根目录</div>
              <ul className="flex flex-col gap-1">
                {(result?.scanned_roots ?? []).map((r) => (
                  <li key={r} className="code truncate text-[10.5px] text-faint" title={r}>
                    {r}
                  </li>
                ))}
              </ul>
              {result && (
                <div className="mt-2.5 text-[11px] text-faint">
                  <span className="text-dim">{result.total_instances}</span> 实例 ·{" "}
                  <span className="text-dim">{groups.length}</span> skill
                </div>
              )}
            </div>
          )}
        </nav>

        {/* ---- list + detail (resizable split) ---- */}
        <div ref={splitRef} className="flex min-w-0 flex-1 overflow-hidden">
          {/* ---- list ---- */}
          <div className="min-w-0 shrink-0 overflow-y-auto" style={{ width: `${listPct}%` }}>
            <SkillList
              sections={sections}
              collapsedSections={collapsedSections}
              selected={selected}
              assignments={groupConfig.assignments}
              loading={loading}
              visibleCount={visible.length}
              onToggleSection={toggleSection}
              onSelect={setSelected}
            />
          </div>

          {/* ---- drag-to-resize divider ---- */}
          <div
            onMouseDown={startSplitDrag}
            role="separator"
            aria-orientation="vertical"
            title="拖拽调整两栏宽度"
            className="relative z-10 w-px shrink-0 cursor-col-resize bg-line transition-colors hover:bg-accent"
          >
            <span className="absolute inset-y-0 -left-1.5 -right-1.5" />
          </div>

          <Detail
            group={selectedGroup}
            config={groupConfig}
            onOp={requestOp}
            onEdit={openEditor}
            onOpenFile={openFile}
            onSync={requestSync}
            onAssign={(skill, cat) => mutateGroups(assignCategory(groupConfig, skill, cat))}
            onUnassign={(skill, cat) => mutateGroups(unassignCategory(groupConfig, skill, cat))}
            onCreateCategory={(name) => mutateGroups(createCategory(groupConfig, name))}
            onDeleteCategory={(name) => mutateGroups(deleteCategory(groupConfig, name))}
          />
        </div>
      </div>

      {pending && (
        <ConfirmModal
          pending={pending}
          busy={busy}
          onCancel={cancelOp}
          onConfirm={confirmOp}
        />
      )}
      {editing && (
        <Suspense fallback={<div className="fixed inset-0 z-55 bg-bg" />}>
          <Editor editing={editing} onClose={closeEditor} onError={setError} onSaved={onSaved} />
        </Suspense>
      )}
      {syncing && (
        <SyncModal
          syncing={syncing}
          busy={syncBusy}
          onCancel={cancelSync}
          onConfirm={confirmSync}
        />
      )}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}

export default App;
