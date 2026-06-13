import { GitCompare } from "lucide-react";
import {
  type SkillGroup,
  type SkillInstance,
  type OpRequest,
  type Tool,
  type GroupConfig,
} from "../types";
import { ToolTag } from "../ui";
import { CategoryEditor } from "./CategoryEditor";
import { InstanceCard } from "./InstanceCard";

export function Detail({
  group,
  config,
  onOp,
  onEdit,
  onOpenFile,
  onSync,
  onAssign,
  onUnassign,
  onCreateCategory,
  onDeleteCategory,
}: {
  group: SkillGroup | null;
  config: GroupConfig;
  onOp: (op: OpRequest) => void;
  onEdit: (inst: SkillInstance) => void;
  onOpenFile: (inst: SkillInstance, path: string) => void;
  onSync: (inst: SkillInstance, target: Tool) => void;
  onAssign: (skill: string, cat: string) => void;
  onUnassign: (skill: string, cat: string) => void;
  onCreateCategory: (name: string) => void;
  onDeleteCategory: (name: string) => void;
}) {
  if (!group) {
    return (
      <aside className="flex min-w-0 flex-1 items-center justify-center bg-panel p-8">
        <p className="max-w-[220px] text-center text-[12.5px] leading-relaxed text-faint">
          选择左侧 skill，查看每个安装实例并管理。
          <br />
          <span className="text-[11px]">↑ ↓ 键可在列表中移动</span>
        </p>
      </aside>
    );
  }
  return (
    <aside className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-panel">
      <div className="border-b border-line px-4 py-3.5">
        <h2 className="text-[16px] font-semibold leading-tight">{group.name}</h2>
        <div className="mt-1 flex items-center gap-2 text-[11.5px] text-dim">
          <span>{group.instances.length} 个安装</span>
          <span className="text-faint">·</span>
          <div className="flex items-center gap-1">
            {group.tools.map((t) => (
              <ToolTag key={t} tool={t} />
            ))}
          </div>
        </div>
      </div>

      <CategoryEditor
        key={group.name}
        skill={group.name}
        config={config}
        onAssign={onAssign}
        onUnassign={onUnassign}
        onCreateCategory={onCreateCategory}
        onDeleteCategory={onDeleteCategory}
      />

      {group.drift && (
        <div className="mx-4 mt-4 flex items-start gap-2 rounded-md border border-[color-mix(in_srgb,var(--color-drift)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-drift)_10%,transparent)] px-3 py-2.5 text-[11.5px] leading-relaxed text-drift">
          <GitCompare size={14} strokeWidth={1.75} className="mt-0.5 flex-shrink-0" />
          <span>各副本正文不一致（body hash 不同）。同步阶段会提供 diff，此处仅提示。</span>
        </div>
      )}

      <div className="flex flex-col gap-3 p-4">
        {group.instances.map((inst) => (
          <InstanceCard
            key={inst.path}
            inst={inst}
            onOp={onOp}
            onEdit={onEdit}
            onOpenFile={onOpenFile}
            onSync={onSync}
          />
        ))}
      </div>
    </aside>
  );
}
