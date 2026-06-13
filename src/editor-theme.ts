// CodeMirror 6 theme for the SKILL.md editor, built from the terminal-grade
// console tokens (App.css @theme) so the editor stays in the app's aesthetic
// rather than shipping a generic One Dark. Colors are resolved from the same
// CSS variables, so a future theme change flows through here too.

import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";
import type { MarkdownConfig } from "@lezer/markdown";
import { tags as t, styleTags } from "@lezer/highlight";

const v = (name: string) => `var(--color-${name})`;

// YAML frontmatter parser for @lezer/markdown. Without it, the closing `---`
// turns the whole `name:/description:/...` block into a setext heading — wrong
// for an app that is *about* frontmatter. This tags the fences and the metadata
// block as their own nodes so they read as data, not as a heading.
const FENCE = /^---\s*$/;
const frontmatter: MarkdownConfig = {
  defineNodes: [{ name: "Frontmatter", block: true }, "FrontmatterMark"],
  props: [
    styleTags({
      Frontmatter: t.meta,
      FrontmatterMark: t.processingInstruction,
    }),
  ],
  parseBlock: [
    {
      name: "Frontmatter",
      before: "HorizontalRule",
      parse(cx, line) {
        if (cx.lineStart !== 0 || !FENCE.test(line.text)) return false;
        const start = cx.lineStart;
        const children = [cx.elt("FrontmatterMark", start, start + 3)];
        let end: number | undefined;
        while (cx.nextLine()) {
          if (FENCE.test(line.text)) {
            end = cx.lineStart + 3;
            break;
          }
        }
        if (end === undefined) return false;
        children.push(cx.elt("FrontmatterMark", end - 3, end));
        cx.nextLine();
        cx.addElement(cx.elt("Frontmatter", start, end, children));
        return true;
      },
    },
  ],
};

export const cmLang = markdown({ extensions: [frontmatter] });

export const cmTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      backgroundColor: "transparent",
      color: v("ink"),
      fontSize: "12.5px",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": {
      fontFamily: "var(--font-mono)",
      lineHeight: "1.65",
      overflow: "auto",
    },
    ".cm-content": { padding: "16px 0", caretColor: v("accent") },
    ".cm-line": { padding: "0 16px" },

    // caret
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: v("accent"), borderLeftWidth: "2px" },

    // selection — rationed green tint
    "&.cm-focused .cm-selectionBackgroundProxy, .cm-selectionBackground, ::selection": {
      backgroundColor: "color-mix(in srgb, var(--color-accent) 24%, transparent)",
    },
    "&.cm-focused .cm-selectionBackground, & .cm-selectionLayer .cm-selectionBackground": {
      backgroundColor: "color-mix(in srgb, var(--color-accent) 24%, transparent)",
    },

    // active line — barely-there lift
    ".cm-activeLine": {
      backgroundColor: "color-mix(in srgb, var(--color-surface) 55%, transparent)",
    },

    // gutter — hairline, dim numbers
    ".cm-gutters": {
      backgroundColor: "transparent",
      color: v("faint"),
      border: "none",
      borderRight: "1px solid var(--color-line)",
    },
    ".cm-lineNumbers .cm-gutterElement": { padding: "0 10px 0 12px", minWidth: "34px" },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
      color: v("dim"),
    },

    // selection-match / search
    ".cm-selectionMatch": {
      backgroundColor: "color-mix(in srgb, var(--color-shared) 18%, transparent)",
    },
    ".cm-matchingBracket, .cm-nonmatchingBracket": {
      backgroundColor: "color-mix(in srgb, var(--color-accent) 18%, transparent)",
      outline: "none",
    },
  },
  { dark: true },
);

// Markdown highlight palette drawn from the functional tokens. Inline/fenced
// code uses the signal green (it reads as "live data", consistent with the diff
// view); structural marks fade to faint so prose stays the focus.
const cmHighlightStyle = HighlightStyle.define([
  { tag: t.heading, color: v("codex"), fontWeight: "700" },
  { tag: [t.heading1, t.heading2], color: v("codex"), fontWeight: "700" },
  { tag: t.strong, color: v("ink"), fontWeight: "700" },
  { tag: t.emphasis, color: v("ink"), fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through", color: v("faint") },
  { tag: [t.link, t.url], color: v("shared"), textDecoration: "underline" },
  { tag: [t.monospace], color: v("accent") },
  { tag: [t.list], color: v("drift") },
  { tag: t.quote, color: v("dim"), fontStyle: "italic" },
  { tag: t.contentSeparator, color: v("faint") },
  // frontmatter block reads as data: legible gray, distinct from prose & headings
  { tag: t.meta, color: v("dim") },
  // markup syntax (#, *, -, `, > markers) recedes
  { tag: [t.processingInstruction, t.labelName], color: v("faint") },
  { tag: t.comment, color: v("faint"), fontStyle: "italic" },
]);

export const cmHighlight = syntaxHighlighting(cmHighlightStyle);
