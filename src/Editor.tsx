import { useEffect, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { X } from "lucide-react";
import { validateSkillMd, writeSkillMd } from "./api";
import { SCOPE_LABELS, type SkillFile, type SkillInstance, type ValidationReport } from "./types";
import { cmLang, cmTheme, cmHighlight } from "./editor-theme";
import { ToolTag } from "./ui";

export interface Editing {
  inst: SkillInstance;
  file: SkillFile;
}

// Lazy-loaded: this module pulls in CodeMirror (~600kB), so it is split out of
// the initial bundle and only fetched when the user opens the editor.
export default function Editor({
  editing,
  onClose,
  onError,
  onSaved,
}: {
  editing: Editing;
  onClose: () => void;
  onError: (e: string) => void;
  onSaved: (backupPath: string | null) => void;
}) {
  const { inst, file } = editing;
  const [content, setContent] = useState(file.content);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [saving, setSaving] = useState(false);
  const debounce = useRef<number | undefined>(undefined);

  const dirty = content !== file.content;

  useEffect(() => {
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => {
      validateSkillMd(content, inst.tool)
        .then(setReport)
        .catch((e) => onError(String(e)));
    }, 220);
    return () => window.clearTimeout(debounce.current);
  }, [content, inst.tool, onError]);

  const hasErrors = report ? !report.ok : false;
  const canSave = file.editable && dirty && !hasErrors && !saving;

  async function save() {
    setSaving(true);
    try {
      const res = await writeSkillMd(file.file_path, content);
      if (res.ok) onSaved(res.backup_path);
      else onError(res.error ?? "写入失败");
    } catch (e) {
      onError(String(e));
    } finally {
      setSaving(false);
    }
  }

  function tryClose() {
    if (dirty && !window.confirm("有未保存的修改，确定放弃？")) return;
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[55] flex flex-col bg-bg">
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-line bg-rail px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-semibold">{inst.name}</span>
          <span className="chip">{SCOPE_LABELS[inst.scope]}</span>
          <ToolTag tool={inst.tool} />
          {!file.enabled && <span className="chip">已禁用</span>}
          {!file.editable && (
            <span className="chip" style={{ color: "var(--color-broken)", borderColor: "var(--color-broken)" }}>
              {file.locked_reason ?? "只读"}
            </span>
          )}
        </div>
        <div className="ml-auto flex gap-2">
          <button className="btn" onClick={tryClose} disabled={saving}>
            <X size={14} strokeWidth={1.75} /> 关闭
          </button>
          <button className="btn btn-go" onClick={save} disabled={!canSave}>
            {saving ? "保存中…" : dirty ? "保存" : "无改动"}
          </button>
        </div>
      </div>
      <code className="code block flex-shrink-0 border-b border-line px-4 py-1.5 text-faint">
        {file.file_path}
      </code>

      <div className="flex flex-1 overflow-hidden">
        <div className="min-w-0 flex-1 overflow-hidden bg-bg">
          <CodeMirror
            value={content}
            onChange={setContent}
            theme={cmTheme}
            extensions={[cmLang, cmHighlight, EditorView.lineWrapping]}
            editable={file.editable}
            readOnly={!file.editable}
            height="100%"
            className="h-full text-[12.5px]"
            basicSetup={{
              lineNumbers: true,
              highlightActiveLine: file.editable,
              highlightActiveLineGutter: file.editable,
              foldGutter: false,
              bracketMatching: true,
              autocompletion: false,
              indentOnInput: false,
            }}
          />
        </div>
        <div className="w-[304px] flex-shrink-0 overflow-y-auto border-l border-line bg-panel p-4">
          <div className="eyebrow mb-3">校验</div>
          {report && (
            <>
              <div className="mb-2 flex items-center gap-2 text-[12.5px]">
                <span className="w-12 flex-shrink-0 text-faint">格式</span>
                <span
                  className="font-semibold"
                  style={{
                    color:
                      report.detected_format === "claude"
                        ? "var(--color-claude)"
                        : report.detected_format === "codex"
                          ? "var(--color-codex)"
                          : "var(--color-faint)",
                  }}
                >
                  {report.detected_format === "claude"
                    ? "Claude"
                    : report.detected_format === "codex"
                      ? "Codex"
                      : "未识别"}
                </span>
              </div>
              <div className="mb-3 flex items-center gap-2 text-[12.5px]">
                <span className="w-12 flex-shrink-0 text-faint">name</span>
                <span>{report.name ?? <span className="text-faint">—</span>}</span>
              </div>
              <div
                className="mb-3 rounded-sm px-2.5 py-2 text-[12.5px] font-semibold"
                style={{
                  background: report.ok
                    ? "color-mix(in srgb, var(--color-accent) 14%, transparent)"
                    : "color-mix(in srgb, var(--color-broken) 16%, transparent)",
                  color: report.ok ? "var(--color-accent)" : "var(--color-broken)",
                }}
              >
                {report.ok ? "✓ 可保存" : "✗ 有错误，需修正"}
              </div>
              <ul className="flex flex-col gap-1.5">
                {report.issues.length === 0 && <li className="text-[12px] text-faint">没有问题</li>}
                {report.issues.map((iss, i) => (
                  <li
                    key={i}
                    className="rounded-sm px-2.5 py-2 text-[12px] leading-relaxed"
                    style={{
                      background:
                        iss.level === "error"
                          ? "color-mix(in srgb, var(--color-broken) 12%, transparent)"
                          : "color-mix(in srgb, var(--color-drift) 12%, transparent)",
                      color: iss.level === "error" ? "var(--color-broken)" : "var(--color-drift)",
                    }}
                  >
                    <span className="mr-1.5 text-[10.5px] opacity-80">{iss.field}</span>
                    {iss.message}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
