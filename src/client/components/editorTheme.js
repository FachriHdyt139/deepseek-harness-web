import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

const palette = {
  background: "#0b0f14",
  foreground: "#c9d1d9",
  comment: "#6b7785",
  keyword: "#ff7b72",
  string: "#a5d6ff",
  number: "#79c0ff",
  function: "#d2a8ff",
  type: "#ffa657",
  variable: "#ffa657",
  property: "#79c0ff",
  tag: "#7ee787",
  attribute: "#79c0ff",
  invalid: "#f85149",
};

const theme = EditorView.theme(
  {
    "&": { color: palette.foreground, backgroundColor: palette.background },
    ".cm-content": { caretColor: "#58a6ff", padding: "8px 0" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#58a6ff" },
    ".cm-gutters": {
      backgroundColor: "#0b0f14",
      color: "#4d5560",
      borderRight: "1px solid #1b2129",
    },
    ".cm-activeLine": { backgroundColor: "#11161d" },
    ".cm-activeLineGutter": { backgroundColor: "#11161d", color: "#8b949e" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "#1f6feb44",
    },
    ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": { backgroundColor: "#1f6feb44" },
    ".cm-selectionMatch": { backgroundColor: "#388bfd33" },
    ".cm-panels": { backgroundColor: "#11161d", color: "#c9d1d9" },
    ".cm-tooltip": { backgroundColor: "#11161d", border: "1px solid #1b2129" },
    ".cm-tooltip-autocomplete ul li[aria-selected]": { backgroundColor: "#1f6feb44" },
    ".cm-searchMatch": { backgroundColor: "#bb800933" },
  },
  { dark: true },
);

const highlight = HighlightStyle.define([
  { tag: [t.comment, t.lineComment, t.blockComment], color: palette.comment, fontStyle: "italic" },
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword], color: palette.keyword },
  { tag: [t.string, t.special(t.string)], color: palette.string },
  { tag: [t.number, t.bool, t.null], color: palette.number },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: palette.function },
  { tag: [t.typeName, t.className, t.namespace], color: palette.type },
  { tag: [t.variableName, t.definition(t.variableName)], color: palette.variable },
  { tag: [t.propertyName], color: palette.property },
  { tag: [t.tagName, t.angleBracket], color: palette.tag },
  { tag: [t.attributeName], color: palette.attribute },
  { tag: [t.invalid], color: palette.invalid },
]);

export const oneDark = [theme, syntaxHighlighting(highlight)];
