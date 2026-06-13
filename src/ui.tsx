import type { Tool } from "./types";

// Shared presentational bits used across App and the lazy-loaded Editor.
export function ToolTag({ tool }: { tool: Tool }) {
  return (
    <span className={`tool-tag ${tool === "claude" ? "tool-claude" : "tool-codex"}`}>
      {tool === "claude" ? "CL" : "CX"}
    </span>
  );
}
