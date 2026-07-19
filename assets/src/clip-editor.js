import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, drawSelection, placeholder } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { syntaxHighlighting, bracketMatching, HighlightStyle, StreamLanguage } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { sql } from "@codemirror/lang-sql";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { marked } from "marked";

const languageConf = new Compartment();
const editableConf = new Compartment();

const webklipHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: "#c792ea" },
  { tag: [tags.string, tags.special(tags.string)], color: "#c3e88d" },
  { tag: tags.comment, color: "#546e7a" },
  { tag: tags.number, color: "#f78c6c" },
  { tag: tags.tagName, color: "#89ddff" },
  { tag: tags.attributeName, color: "#ffcb6b" },
  { tag: tags.function(tags.variableName), color: "#82aaff" },
  { tag: tags.definition(tags.variableName), color: "#82aaff" },
  { tag: tags.heading, color: "#82aaff", fontWeight: "bold" },
  { tag: tags.strong, fontWeight: "bold" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.link, color: "#22d3ee", textDecoration: "underline" },
]);

function languageExtension(lang) {
  switch (lang) {
    case "javascript":
      return javascript();
    case "typescript":
      return javascript({ typescript: true });
    case "python":
      return python();
    case "bash":
      return StreamLanguage.define(shell);
    case "json":
      return json();
    case "html":
      return html();
    case "css":
      return css();
    case "sql":
      return sql();
    case "markdown":
      return markdown();
    default:
      return [];
  }
}

function webklipTheme() {
  return EditorView.theme(
    {
      "&": {
        height: "100%",
        fontSize: "0.8125rem",
        fontFamily: 'var(--font-mono, "JetBrains Mono", ui-monospace, monospace)',
        backgroundColor: "transparent",
      },
      ".cm-scroller": {
        overflow: "auto",
        lineHeight: "1.65",
        fontFamily: "inherit",
      },
      ".cm-content": {
        padding: "1rem 1.1rem",
        caretColor: "var(--accent, #22d3ee)",
      },
      ".cm-gutters": {
        backgroundColor: "transparent",
        border: "none",
        color: "var(--text-tertiary, #64748b)",
      },
      ".cm-lineNumbers .cm-gutterElement": {
        padding: "0 0.5rem 0 0.25rem",
        minWidth: "2rem",
      },
      "&.cm-focused .cm-cursor": {
        borderLeftColor: "var(--accent, #22d3ee)",
      },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
        backgroundColor: "rgba(34, 211, 238, 0.35) !important",
      },
      ".cm-activeLineGutter": {
        backgroundColor: "transparent",
      },
      ".cm-activeLine": {
        backgroundColor: "rgba(255, 255, 255, 0.03)",
      },
    },
    { dark: true }
  );
}

(function () {
  let view = null;
  let syncing = false;
  let previewOpen = false;
  let wrap = null;
  let textarea = null;
  let mountEl = null;
  let previewEl = null;
  let bound = false;

  function getWrap() {
    return document.getElementById("clip-editor-wrap");
  }

  function getTextarea() {
    return document.getElementById("clip-content");
  }

  function language() {
    return wrap?.dataset.language || "";
  }

  function isEncrypted() {
    return wrap?.dataset.encrypted === "true";
  }

  function shouldUseEditor() {
    const ta = getTextarea();
    return ta && !ta.disabled && !isEncrypted();
  }

  function updatePreview(text) {
    if (!previewEl) return;
    if (!previewOpen || language() !== "markdown") {
      previewEl.hidden = true;
      return;
    }
    previewEl.hidden = false;
    previewEl.innerHTML = marked.parse(text || "", { async: false });
  }

  function updatePreviewToggle() {
    const btn = document.getElementById("md-preview-toggle");
    if (!btn) return;
    const show = language() === "markdown" && shouldUseEditor();
    btn.hidden = !show;
    if (!show) {
      previewOpen = false;
      btn.classList.remove("is-active");
      wrap?.classList.remove("clip-editor--split");
      if (previewEl) previewEl.hidden = true;
    }
  }

  function syncToTextarea(text) {
    const ta = getTextarea();
    if (!ta || syncing) return;
    syncing = true;
    ta.value = text;
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    syncing = false;
  }

  function destroyView() {
    if (view) {
      view.destroy();
      view = null;
    }
    if (mountEl) {
      mountEl.replaceChildren();
      mountEl.hidden = true;
    }
    wrap?.classList.remove("clip-editor--codemirror");
    const ta = getTextarea();
    if (ta) ta.classList.remove("clip-editor--hidden");
  }

  function createView() {
    const ta = getTextarea();
    if (!ta || !mountEl || !shouldUseEditor()) {
      destroyView();
      return;
    }

    destroyView();

    ta.classList.add("clip-editor--hidden");
    mountEl.hidden = false;
    wrap.classList.add("clip-editor--codemirror");

    const extensions = [
      webklipTheme(),
      syntaxHighlighting(webklipHighlight),
      bracketMatching(),
      history(),
      drawSelection(),
      highlightActiveLineGutter(),
      lineNumbers(),
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      languageConf.of(languageExtension(language())),
      editableConf.of(EditorView.editable.of(!ta.disabled)),
      EditorView.lineWrapping,
      placeholder("Paste or type anything…"),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const text = update.state.doc.toString();
          syncToTextarea(text);
          updatePreview(text);
        }
      }),
    ];

    view = new EditorView({
      state: EditorState.create({
        doc: ta.value,
        extensions,
      }),
      parent: mountEl,
    });

    updatePreview(ta.value);
    updatePreviewToggle();
  }

  function refresh() {
    wrap = getWrap();
    textarea = getTextarea();
    mountEl = document.getElementById("clip-editor-mount");
    previewEl = document.getElementById("clip-md-preview");
    if (!wrap || !textarea) return;

    if (!shouldUseEditor()) {
      destroyView();
      updatePreviewToggle();
      return;
    }

    if (!view) {
      createView();
      return;
    }

    view.dispatch({
      effects: languageConf.reconfigure(languageExtension(language())),
    });

    const cmText = view.state.doc.toString();
    if (textarea.value !== cmText) {
      syncing = true;
      view.dispatch({
        changes: { from: 0, to: cmText.length, insert: textarea.value },
      });
      syncing = false;
    }

    view.dispatch({
      effects: editableConf.reconfigure(EditorView.editable.of(!textarea.disabled)),
    });

    updatePreview(textarea.value);
    updatePreviewToggle();
  }

  function onTextareaInput() {
    if (syncing || !view) return;
    const cmText = view.state.doc.toString();
    if (textarea.value !== cmText) {
      syncing = true;
      view.dispatch({
        changes: { from: 0, to: cmText.length, insert: textarea.value },
      });
      syncing = false;
      updatePreview(textarea.value);
    }
  }

  function onSettingsChange(e) {
    if (e.target instanceof HTMLSelectElement && e.target.name === "language") {
      wrap.dataset.language = e.target.value;
      refresh();
    }
  }

  function onHtmxSwap(e) {
    if (
      e.detail.target?.id === "settings-root" ||
      e.detail.target?.id === "clip-content"
    ) {
      wrap = getWrap();
      textarea = getTextarea();
      if (!wrap || !textarea) return;

      const langSelect = document.querySelector(
        '#settings-root select[name="language"]:not(:disabled)'
      );
      if (langSelect instanceof HTMLSelectElement) {
        wrap.dataset.language = langSelect.value;
      }
      const enc = document.querySelector(
        '#settings-root input[name="encrypted"][type="checkbox"]:not(:disabled)'
      );
      if (enc instanceof HTMLInputElement) {
        const flag = enc.checked ? "true" : "false";
        wrap.dataset.encrypted = flag;
        textarea.dataset.encrypted = flag;
      }

      if (e.detail.target?.id === "clip-content") {
        destroyView();
      }
      refresh();
    }
  }

  function togglePreview() {
    previewOpen = !previewOpen;
    const btn = document.getElementById("md-preview-toggle");
    btn?.classList.toggle("is-active", previewOpen);
    btn?.setAttribute("aria-pressed", String(previewOpen));
    wrap?.classList.toggle("clip-editor--split", previewOpen);
    if (view) updatePreview(view.state.doc.toString());
    else refresh();
  }

  function bind() {
    if (bound) return;
    bound = true;

    document.getElementById("md-preview-toggle")?.addEventListener("click", togglePreview);
    document.addEventListener("change", onSettingsChange);
    document.body.addEventListener("htmx:afterSwap", onHtmxSwap);

    document.body.addEventListener("input", (e) => {
      if (e.target?.id === "clip-content") onTextareaInput();
    });
  }

  function init() {
    bind();
    window.WebklipEditor = {
      refresh,
      getValue() {
        return view?.state.doc.toString() ?? getTextarea()?.value ?? "";
      },
    };
    refresh();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
