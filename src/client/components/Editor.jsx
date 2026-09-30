import { useEffect, useRef } from "react";
import { EditorView, keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { basicSetup } from "codemirror";
import { indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "./editorTheme.js";

const LANGUAGE_LOADERS = [
  [/\.(js|mjs|cjs|jsx)$/, javascript],
  [/\.(ts|mts|cts|tsx)$/, () => javascript({ typescript: true, jsx: true })],
  [/\.py$/, python],
  [/\.(html|htm|vue)$/, html],
  [/\.css$/, css],
  [/\.json$/, json],
  [/\.(md|markdown)$/, markdown],
];

export function languageFor(path) {
  for (const [pattern, loader] of LANGUAGE_LOADERS) {
    if (pattern.test(path)) return loader();
  }
  return null;
}

export default function Editor({ path, value, onChange, onSave }) {
  const host = useRef(null);
  const view = useRef(null);
  const latest = useRef({ onChange, onSave });
  latest.current = { onChange, onSave };

  useEffect(() => {
    if (!host.current) return undefined;
    const state = EditorState.create({
      doc: value ?? "",
      extensions: [
        basicSetup,
        keymap.of([
          {
            key: "Mod-s",
            run: () => {
              latest.current.onSave?.();
              return true;
            },
          },
          indentWithTab,
        ]),
        languageFor(path),
        oneDark,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) latest.current.onChange?.(update.state.doc.toString());
        }),
        EditorView.theme({
          "&": { height: "100%", fontSize: "13px" },
          ".cm-scroller": { overflow: "auto", fontFamily: "var(--mono)" },
        }),
      ].filter(Boolean),
    });

    const editor = new EditorView({ state, parent: host.current });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
    // Recreate the editor whenever the opened file changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    const current = editor.state.doc.toString();
    if (value !== undefined && value !== current) {
      editor.dispatch({
        changes: { from: 0, to: current.length, insert: value ?? "" },
      });
    }
  }, [value]);

  return <div className="editor-host" ref={host} />;
}
