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
import { yaml } from "@codemirror/lang-yaml";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { marked } from "marked";
import { detectLanguage } from "./detect-language.js";

const languageConf = new Compartment();
const editableConf = new Compartment();
const themeConf = new Compartment();

const webklipHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--hl-keyword)" },
  { tag: [tags.string, tags.special(tags.string)], color: "var(--hl-string)" },
  { tag: tags.comment, color: "var(--hl-comment)" },
  { tag: tags.number, color: "var(--hl-number)" },
  { tag: tags.tagName, color: "var(--hl-tag)" },
  { tag: tags.attributeName, color: "var(--hl-attr)" },
  { tag: tags.function(tags.variableName), color: "var(--hl-function)" },
  { tag: tags.definition(tags.variableName), color: "var(--hl-function)" },
  { tag: tags.heading, color: "var(--hl-function)", fontWeight: "bold" },
  { tag: tags.strong, fontWeight: "bold" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.link, color: "var(--accent)", textDecoration: "underline" },
]);

function isLightTheme() {
  return document.documentElement.dataset.theme !== "dark";
}

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
    case "yaml":
      return yaml();
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
        caretColor: "var(--accent, #2ec4b6)",
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
        borderLeftColor: "var(--accent, #2ec4b6)",
      },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
        backgroundColor: "var(--hl-selection) !important",
      },
      ".cm-activeLineGutter": {
        backgroundColor: "transparent",
      },
      ".cm-activeLine": {
        backgroundColor: "var(--hl-active-line)",
      },
    },
    { dark: !isLightTheme() }
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
  let htmlPreviewTimer = 0;
  let lastHtmlSrcdoc = null;
  const mobileQuery = window.matchMedia("(max-width: 767px)");
  const HTML_PREVIEW_DEBOUNCE_MS = 200;
  // Scripts may run, but without allow-same-origin they cannot touch the parent page.
  const HTML_IFRAME_SANDBOX = "allow-scripts allow-forms allow-modals allow-popups";

  function getWrap() {
    return document.getElementById("clip-editor-wrap");
  }

  function getTextarea() {
    return document.getElementById("clip-content");
  }

  function language() {
    return wrap?.dataset.language || "";
  }

  function languageSelects() {
    const sel = document.getElementById("clip-tab-language");
    return sel ? [sel] : [];
  }

  function activeLanguageSelect() {
    return document.getElementById("clip-tab-language");
  }

  /** Apply detection only while language is unset (plain text). Never overrides a choice. */
  function maybeAutoDetectLanguage(text) {
    if (!wrap || !shouldUseEditor()) return;
    if (language()) return;
    const detected = detectLanguage(text ?? "");
    if (!detected) return;

    for (const sel of languageSelects()) {
      if (sel instanceof HTMLSelectElement) sel.value = detected;
    }
    wrap.dataset.language = detected;

    const primary = activeLanguageSelect();
    if (primary instanceof HTMLSelectElement) {
      // Lets clip-tabs pick up the change (workspace + sync).
      primary.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      refresh();
    }
  }

  function isEncrypted() {
    return wrap?.dataset.encrypted === "true";
  }

  function isMobile() {
    return mobileQuery.matches;
  }

  function getPreviewModal() {
    return document.querySelector("[data-md-preview-modal]");
  }

  function getModalPreviewBody() {
    return document.getElementById("md-preview-modal-body");
  }

  function shouldUseEditor() {
    const ta = getTextarea();
    if (!ta || ta.disabled) return false;
    if (!isEncrypted()) return true;
    return ta.dataset.decrypted === "true";
  }

  function openPreviewModal() {
    const backdrop = getPreviewModal();
    const modal = document.getElementById("md-preview-modal");
    if (!backdrop || !modal) return;
    backdrop.hidden = false;
    modal.hidden = false;
    requestAnimationFrame(() => {
      backdrop.classList.add("is-open");
    });
    window.WebklipMobile?.syncBodyScrollLock?.();
  }

  function closePreviewModal() {
    const backdrop = getPreviewModal();
    const modal = document.getElementById("md-preview-modal");
    if (!backdrop || !modal || backdrop.hidden) return;
    backdrop.classList.remove("is-open");
    window.setTimeout(() => {
      backdrop.hidden = true;
      modal.hidden = true;
      window.WebklipMobile?.syncBodyScrollLock?.();
    }, 220);
  }

  function previewText() {
    return view?.state.doc.toString() ?? getTextarea()?.value ?? "";
  }

  function isPreviewableLanguage(lang = language()) {
    return lang === "markdown" || lang === "html";
  }

  /** Preview is available whenever content can be rendered (not tied to edit mode). */
  function canPreviewContent() {
    if (!isPreviewableLanguage()) return false;
    const ta = getTextarea();
    if (!ta) return false;
    if (isEncrypted() && ta.dataset.decrypted !== "true") return false;
    return true;
  }

  function clearHtmlPreviewTimer() {
    if (htmlPreviewTimer) {
      window.clearTimeout(htmlPreviewTimer);
      htmlPreviewTimer = 0;
    }
  }

  function clearPreviewContainer(el) {
    if (!el) return;
    el.replaceChildren();
    el.classList.remove("clip-md-preview--html");
  }

  function ensureHtmlFrame(container) {
    let frame = container.querySelector("iframe.clip-html-preview");
    if (frame) return frame;
    container.replaceChildren();
    container.classList.add("clip-md-preview--html");
    frame = document.createElement("iframe");
    frame.className = "clip-html-preview";
    frame.title = "HTML preview";
    frame.setAttribute("sandbox", HTML_IFRAME_SANDBOX);
    frame.setAttribute("referrerpolicy", "no-referrer");
    container.appendChild(frame);
    return frame;
  }

  function writeHtmlPreview(container, text) {
    if (!container) return;
    const frame = ensureHtmlFrame(container);
    const srcdoc = text ?? "";
    if (lastHtmlSrcdoc === srcdoc && frame.srcdoc === srcdoc) return;
    lastHtmlSrcdoc = srcdoc;
    frame.srcdoc = srcdoc;
  }

  function scheduleHtmlPreview(desktopEl, modalEl, useModal, text) {
    clearHtmlPreviewTimer();
    const apply = () => {
      htmlPreviewTimer = 0;
      if (useModal) {
        writeHtmlPreview(modalEl, text);
      } else {
        writeHtmlPreview(desktopEl, text);
      }
    };
    // Immediate first paint when opening / switching target; debounce live edits.
    if (lastHtmlSrcdoc === null) {
      apply();
      return;
    }
    htmlPreviewTimer = window.setTimeout(apply, HTML_PREVIEW_DEBOUNCE_MS);
  }

  function updatePreview(text) {
    const lang = language();
    const show = previewOpen && isPreviewableLanguage(lang);
    const useModal = isMobile();

    if (!show) {
      clearHtmlPreviewTimer();
      lastHtmlSrcdoc = null;
      if (previewEl) {
        previewEl.hidden = true;
        clearPreviewContainer(previewEl);
      }
      clearPreviewContainer(getModalPreviewBody());
      return;
    }

    const modalBody = getModalPreviewBody();

    if (lang === "html") {
      if (useModal) {
        if (previewEl) {
          previewEl.hidden = true;
          clearPreviewContainer(previewEl);
        }
      } else {
        if (previewEl) previewEl.hidden = false;
        clearPreviewContainer(modalBody);
      }
      scheduleHtmlPreview(previewEl, modalBody, useModal, text);
      return;
    }

    // Markdown: render into the host document (styled by .clip-md-preview).
    clearHtmlPreviewTimer();
    lastHtmlSrcdoc = null;
    const html = marked.parse(text || "", { async: false });

    if (previewEl) {
      if (useModal) {
        previewEl.hidden = true;
        clearPreviewContainer(previewEl);
      } else {
        previewEl.hidden = false;
        previewEl.classList.remove("clip-md-preview--html");
        previewEl.innerHTML = html;
      }
    }

    if (modalBody) {
      if (useModal) {
        modalBody.classList.remove("clip-md-preview--html");
        modalBody.innerHTML = html;
      } else {
        clearPreviewContainer(modalBody);
      }
    }
  }

  function applyPreviewMode() {
    const btn = document.getElementById("md-preview-toggle");
    btn?.classList.toggle("is-active", previewOpen);
    btn?.setAttribute("aria-pressed", String(previewOpen));

    if (!previewOpen) {
      wrap?.classList.remove("clip-editor--split");
      closePreviewModal();
      updatePreview(previewText());
      return;
    }

    // Force a fresh HTML frame paint when (re)opening preview.
    lastHtmlSrcdoc = null;

    if (isMobile()) {
      wrap?.classList.remove("clip-editor--split");
      openPreviewModal();
    } else {
      closePreviewModal();
      wrap?.classList.add("clip-editor--split");
    }
    updatePreview(previewText());
  }

  function setPreviewOpen(open) {
    previewOpen = open;
    applyPreviewMode();
  }

  function updatePreviewToggle() {
    const btn = document.getElementById("md-preview-toggle");
    if (!btn) return;
    const show = canPreviewContent();
    btn.hidden = !show;
    if (!show && previewOpen) {
      setPreviewOpen(false);
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
      themeConf.of([webklipTheme(), syntaxHighlighting(webklipHighlight)]),
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
          const pasted = update.transactions.some((tr) =>
            tr.isUserEvent("input.paste")
          );
          if (pasted) maybeAutoDetectLanguage(text);
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
    maybeAutoDetectLanguage(ta.value);
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

  function onTextareaPaste() {
    // Fallback when CodeMirror is not mounted (or paste lands on the textarea).
    queueMicrotask(() => {
      const ta = getTextarea();
      if (!ta) return;
      maybeAutoDetectLanguage(ta.value);
    });
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

      const enc =
        document.querySelector(
          "#settings-form-desktop:not([inert]) input[name='encrypted'][type='checkbox']"
        ) ||
        document.querySelector(
          "#settings-form-mobile:not([inert]) input[name='encrypted'][type='checkbox']"
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
    setPreviewOpen(!previewOpen);
  }

  function bind() {
    if (bound) return;
    bound = true;

    document.getElementById("md-preview-toggle")?.addEventListener("click", togglePreview);
    const previewBackdrop = getPreviewModal();
    if (previewBackdrop && previewBackdrop.dataset.bound !== "1") {
      previewBackdrop.dataset.bound = "1";
      previewBackdrop.addEventListener("click", (e) => {
        if (e.target === previewBackdrop) setPreviewOpen(false);
      });
      previewBackdrop.querySelectorAll("[data-close-md-preview]").forEach((btn) => {
        btn.addEventListener("click", () => setPreviewOpen(false));
      });
    }
    mobileQuery.addEventListener("change", () => {
      if (previewOpen) applyPreviewMode();
    });
    document.addEventListener("change", onSettingsChange);
    document.body.addEventListener("htmx:afterSwap", onHtmxSwap);
    document.addEventListener("webklip-theme-change", () => {
      if (!view) return;
      view.dispatch({
        effects: themeConf.reconfigure([webklipTheme(), syntaxHighlighting(webklipHighlight)]),
      });
    });

    document.body.addEventListener("input", (e) => {
      if (e.target?.id === "clip-content") onTextareaInput();
    });
    document.body.addEventListener("paste", (e) => {
      if (e.target?.id === "clip-content") onTextareaPaste();
    });
  }

  function init() {
    bind();
    window.WebklipEditor = {
      refresh,
      closePreview() {
        if (previewOpen) setPreviewOpen(false);
      },
      isPreviewOpen() {
        return previewOpen;
      },
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
