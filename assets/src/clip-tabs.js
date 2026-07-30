/* Webklip multi-tab workspace UI + local state */
(function () {
  const WORKSPACE_VERSION = 1;
  const MAX_TABS = 20;
  const MAX_TITLE = 64;
  const DEFAULT_MAX_CONTENT = 1_000_000;

  function maxContentLength() {
    const ta = textarea();
    const raw = ta?.dataset.maxContentLength;
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_CONTENT;
  }

  function newId() {
    return crypto.randomUUID();
  }

  function clampTitle(title) {
    const t = String(title || "")
      .replace(/\s+/g, " ")
      .trim();
    return (t || "Untitled").slice(0, MAX_TITLE);
  }

  function createWorkspace(body = "", opts = {}) {
    const id = opts.id || newId();
    return {
      v: WORKSPACE_VERSION,
      tabs: [
        {
          id,
          title: clampTitle(opts.title || "Content"),
          body: body || "",
          language: opts.language ?? null,
        },
      ],
      activeTabId: id,
    };
  }

  function isWorkspaceDocument(raw) {
    const trimmed = String(raw || "").trim();
    if (!trimmed.startsWith("{")) return false;
    try {
      const parsed = JSON.parse(trimmed);
      return (
        parsed &&
        parsed.v === WORKSPACE_VERSION &&
        Array.isArray(parsed.tabs) &&
        parsed.tabs.length > 0 &&
        typeof parsed.activeTabId === "string" &&
        parsed.tabs.every(
          (t) =>
            t &&
            typeof t.id === "string" &&
            typeof t.title === "string" &&
            typeof t.body === "string"
        )
      );
    } catch {
      return false;
    }
  }

  function parseWorkspace(raw, fallbackLanguage = null) {
    if (isWorkspaceDocument(raw)) {
      const parsed = JSON.parse(String(raw).trim());
      const tabs = parsed.tabs.map((t) => ({
        id: t.id,
        title: clampTitle(t.title),
        body: t.body,
        language: t.language === undefined ? fallbackLanguage : t.language,
      }));
      const activeTabId = tabs.some((t) => t.id === parsed.activeTabId)
        ? parsed.activeTabId
        : tabs[0].id;
      return { v: WORKSPACE_VERSION, tabs, activeTabId };
    }
    return createWorkspace(String(raw ?? ""), { language: fallbackLanguage });
  }

  function serializeWorkspace(ws) {
    return JSON.stringify({
      v: WORKSPACE_VERSION,
      tabs: ws.tabs.map((t) => ({
        id: t.id,
        title: t.title,
        body: t.body,
        language: t.language,
      })),
      activeTabId: ws.activeTabId,
    });
  }

  function getActiveTab(ws) {
    return ws.tabs.find((t) => t.id === ws.activeTabId) || ws.tabs[0];
  }

  function readBootstrap() {
    const el = document.getElementById("clip-workspace-data");
    if (!el) return null;
    try {
      return JSON.parse(el.textContent || "");
    } catch {
      return null;
    }
  }

  function textarea() {
    return document.getElementById("clip-content");
  }

  function wrapEl() {
    return document.getElementById("clip-editor-wrap");
  }

  function tabBar() {
    return document.getElementById("clip-tab-bar");
  }

  function isEncrypted() {
    return textarea()?.dataset.encrypted === "true";
  }

  function isReadOnly() {
    const ta = textarea();
    return !ta || ta.readOnly || (ta.disabled && ta.dataset.decrypted !== "true");
  }

  function canEdit() {
    const ta = textarea();
    if (!ta || ta.readOnly) return false;
    if (isEncrypted() && ta.dataset.decrypted !== "true") return false;
    return !ta.disabled;
  }

  let state = null;
  let suppressInput = false;

  function syncEditorFromActive(opts = {}) {
    const ta = textarea();
    const wrap = wrapEl();
    if (!ta || !state) return;
    const active = getActiveTab(state);
    suppressInput = true;
    ta.value = active.body;
    if (wrap) wrap.dataset.language = active.language || "";
    suppressInput = false;
    syncLanguageSelect(active.language);
    window.WebklipEditor?.refresh?.();
    updateCharCount();
    if (opts.rebuildTabs) renderTabs();
    else paintActiveTabs();
  }

  function syncLanguageSelect(language) {
    const sel = document.getElementById("clip-tab-language");
    if (!(sel instanceof HTMLSelectElement)) return;
    const value = language || "";
    if (sel.value !== value) sel.value = value;
    sel.disabled = !canEdit();
  }

  function updateCharCount() {
    const el = document.getElementById("char-count");
    if (!el) return;
    const max = maxContentLength();
    let n = 0;
    if (state) {
      flushActiveBody();
      n = serializeWorkspace(state).length;
    } else {
      const ta = textarea();
      n = ta ? ta.value.length : 0;
    }
    el.textContent = `${n.toLocaleString()} / ${max.toLocaleString()}`;
    el.title = `Stored size including tabs (max ${max.toLocaleString()} characters)`;
    el.classList.toggle("is-over-limit", n > max);
  }

  function flushActiveBody() {
    if (!state) return;
    const ta = textarea();
    if (!ta) return;
    const active = getActiveTab(state);
    state = {
      ...state,
      tabs: state.tabs.map((t) =>
        t.id === active.id ? { ...t, body: ta.value } : t
      ),
    };
  }

  function paintActiveTabs() {
    const bar = tabBar();
    if (!bar || !state) return;
    bar.querySelectorAll(".clip-tab[data-tab-id]").forEach((el) => {
      const on = el.dataset.tabId === state.activeTabId;
      el.classList.toggle("is-active", on);
      el.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  function renderTabs() {
    const bar = tabBar();
    if (!bar || !state) return;
    const editable = canEdit();
    bar.replaceChildren();

    for (const tab of state.tabs) {
      const btn = document.createElement("div");
      btn.className =
        "clip-tab" + (tab.id === state.activeTabId ? " is-active" : "");
      btn.dataset.tabId = tab.id;
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", tab.id === state.activeTabId ? "true" : "false");
      btn.tabIndex = 0;
      if (editable) btn.title = "Double-click to rename";

      const title = document.createElement("span");
      title.className = "clip-tab__title";
      title.textContent = tab.title;
      btn.appendChild(title);

      if (editable && state.tabs.length > 1) {
        const close = document.createElement("button");
        close.type = "button";
        close.className = "clip-tab__close";
        close.dataset.closeTab = tab.id;
        close.setAttribute("aria-label", `Close ${tab.title}`);
        close.textContent = "×";
        btn.appendChild(close);
      }

      bar.appendChild(btn);
    }

    if (editable && state.tabs.length < MAX_TABS) {
      const add = document.createElement("button");
      add.type = "button";
      add.className = "clip-tab clip-tab--add";
      add.dataset.addTab = "1";
      add.setAttribute("aria-label", "New tab");
      add.textContent = "+";
      bar.appendChild(add);
    }
  }

  function emitLocal(type, payload) {
    document.dispatchEvent(
      new CustomEvent("webklip-workspace", { detail: { type, ...payload } })
    );
  }

  function renameTab(tabId, title, opts = {}) {
    if (!state || !state.tabs.some((t) => t.id === tabId)) return;
    const nextTitle = clampTitle(title);
    state = {
      ...state,
      tabs: state.tabs.map((t) =>
        t.id === tabId ? { ...t, title: nextTitle } : t
      ),
    };
    renderTabs();
    if (!opts.remote && canEdit()) {
      emitLocal("tabs_meta", {
        action: "rename",
        tabId,
        title: nextTitle,
      });
    }
  }

  function startInlineRename(tabId) {
    if (!canEdit() || !state) return;
    const bar = tabBar();
    const tabEl = bar?.querySelector(
      `.clip-tab[data-tab-id="${CSS.escape(tabId)}"]`
    );
    const titleEl = tabEl?.querySelector(".clip-tab__title");
    const tab = state.tabs.find((t) => t.id === tabId);
    if (!tabEl || !titleEl || !tab) return;
    if (tabEl.querySelector(".clip-tab__rename")) return;

    const input = document.createElement("input");
    input.type = "text";
    input.className = "clip-tab__rename";
    input.value = tab.title;
    input.setAttribute("aria-label", "Rename tab");
    input.maxLength = MAX_TITLE;
    titleEl.replaceWith(input);

    let finished = false;
    const finish = (commit) => {
      if (finished) return;
      finished = true;
      if (commit) renameTab(tabId, input.value);
      else renderTabs();
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        finish(true);
      } else if (e.key === "Escape") {
        e.preventDefault();
        finish(false);
      }
    });
    input.addEventListener("blur", () => finish(true));
    input.focus();
    input.select();
  }

  function selectTab(tabId, opts = {}) {
    if (!state || !state.tabs.some((t) => t.id === tabId)) return;
    // Same tab: keep DOM so double-click rename can fire.
    if (state.activeTabId === tabId && !opts.force) return;
    flushActiveBody();
    state = { ...state, activeTabId: tabId };
    syncEditorFromActive();
    if (!opts.remote && canEdit()) {
      emitLocal("tabs_meta", { action: "activate", tabId });
    }
  }

  function addNewTab(opts = {}) {
    if (!state || state.tabs.length >= MAX_TABS) return;
    flushActiveBody();
    const id = opts.id || newId();
    const tab = {
      id,
      title: clampTitle(opts.title || `Tab ${state.tabs.length + 1}`),
      body: opts.body || "",
      language: opts.language ?? getActiveTab(state).language,
    };
    state = {
      ...state,
      tabs: [...state.tabs, tab],
      activeTabId: id,
    };
    syncEditorFromActive({ rebuildTabs: true });
    if (!opts.remote && canEdit()) {
      emitLocal("tabs_meta", {
        action: "add",
        tabId: id,
        title: tab.title,
        body: tab.body,
        language: tab.language,
      });
    }
  }

  function closeTab(tabId, opts = {}) {
    if (!state || state.tabs.length <= 1) return;
    flushActiveBody();
    const idx = state.tabs.findIndex((t) => t.id === tabId);
    if (idx < 0) return;
    const tabs = state.tabs.filter((t) => t.id !== tabId);
    let activeTabId = state.activeTabId;
    if (activeTabId === tabId) {
      activeTabId = (tabs[idx - 1] || tabs[0]).id;
    }
    state = { ...state, tabs, activeTabId };
    syncEditorFromActive({ rebuildTabs: true });
    if (!opts.remote && canEdit()) {
      emitLocal("tabs_meta", { action: "remove", tabId });
    }
  }

  function applyRemoteWorkspace(workspace) {
    if (!workspace || !Array.isArray(workspace.tabs)) return;
    const ta = textarea();
    const prevActive = state?.activeTabId;
    const prevBody = ta && !suppressInput ? ta.value : null;
    state = {
      v: WORKSPACE_VERSION,
      tabs: workspace.tabs.map((t) => ({
        id: t.id,
        title: clampTitle(t.title),
        body: t.body,
        language: t.language ?? null,
      })),
      // Keep local active tab if it still exists — don't jump with others.
      activeTabId: workspace.tabs.some((t) => t.id === prevActive)
        ? prevActive
        : workspace.activeTabId,
    };
    if (prevBody != null && prevActive && state.tabs.some((t) => t.id === prevActive)) {
      state = {
        ...state,
        tabs: state.tabs.map((t) =>
          t.id === prevActive ? { ...t, body: prevBody } : t
        ),
      };
    }
    syncEditorFromActive({ rebuildTabs: true });
  }

  function applyRemoteTabUpdate(tabId, body) {
    if (!state) return;
    state = {
      ...state,
      tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, body } : t)),
    };
    if (state.activeTabId === tabId) {
      const ta = textarea();
      if (ta) {
        suppressInput = true;
        ta.value = body;
        suppressInput = false;
        window.WebklipEditor?.refresh?.();
        updateCharCount();
      }
    }
  }

  function loadPlaintext(plaintext) {
    state = parseWorkspace(plaintext, wrapEl()?.dataset.language || null);
    syncEditorFromActive({ rebuildTabs: true });
  }

  function getSerializedPlaintext() {
    flushActiveBody();
    if (!state) return "";
    return serializeWorkspace(state);
  }

  function bind() {
    const bar = tabBar();
    if (bar && bar.dataset.bound !== "1") {
      bar.dataset.bound = "1";
      bar.addEventListener("click", (e) => {
        const t = e.target;
        if (!(t instanceof Element)) return;
        if (t.closest(".clip-tab__rename")) return;
        const closeId = t.closest("[data-close-tab]")?.getAttribute("data-close-tab");
        if (closeId) {
          e.preventDefault();
          e.stopPropagation();
          closeTab(closeId);
          return;
        }
        if (t.closest("[data-add-tab]")) {
          e.preventDefault();
          addNewTab();
          return;
        }
        const tabBtn = t.closest(".clip-tab[data-tab-id]");
        if (tabBtn) {
          selectTab(tabBtn.getAttribute("data-tab-id"));
        }
      });

      bar.addEventListener("dblclick", (e) => {
        if (!canEdit()) return;
        const t = e.target;
        if (!(t instanceof Element)) return;
        if (t.closest("[data-close-tab]") || t.closest("[data-add-tab]")) return;
        const tabBtn = t.closest(".clip-tab[data-tab-id]");
        if (!tabBtn) return;
        e.preventDefault();
        const tabId = tabBtn.getAttribute("data-tab-id");
        if (tabId !== state?.activeTabId) selectTab(tabId);
        startInlineRename(tabId);
      });

      bar.addEventListener("keydown", (e) => {
        if (!canEdit()) return;
        if (!(e.target instanceof Element)) return;
        if (e.target instanceof HTMLInputElement) return;
        const tabBtn = e.target.closest(".clip-tab[data-tab-id]");
        if (!tabBtn) return;
        if (e.key === "F2") {
          e.preventDefault();
          startInlineRename(tabBtn.getAttribute("data-tab-id"));
        } else if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectTab(tabBtn.getAttribute("data-tab-id"));
        }
      });
    }

    document.body.addEventListener("input", (e) => {
      if (suppressInput) return;
      if (e.target?.id !== "clip-content") return;
      flushActiveBody();
      updateCharCount();
      emitLocal("tab_update", {
        tabId: state?.activeTabId,
        body: textarea()?.value ?? "",
      });
    });

    document.addEventListener("change", (e) => {
      if (!(e.target instanceof HTMLSelectElement)) return;
      if (e.target.id !== "clip-tab-language" && e.target.name !== "language") return;
      if (!state || !canEdit()) return;
      const lang = e.target.value || null;
      const active = getActiveTab(state);
      state = {
        ...state,
        tabs: state.tabs.map((t) =>
          t.id === active.id ? { ...t, language: lang } : t
        ),
      };
      const wrap = wrapEl();
      if (wrap) wrap.dataset.language = lang || "";
      emitLocal("tabs_meta", {
        action: "language",
        tabId: active.id,
        language: lang,
      });
    });

    document.body.addEventListener("htmx:afterSwap", (e) => {
      if (e.detail.target?.id !== "clip-content") return;
      const ta = textarea();
      if (!ta) return;
      const restore = ta.dataset.workspaceRestore;
      if (restore) {
        try {
          loadPlaintext(decodeURIComponent(restore));
        } catch {
          loadPlaintext(restore);
        }
        delete ta.dataset.workspaceRestore;
        return;
      }
      if (isWorkspaceDocument(ta.value)) {
        loadPlaintext(ta.value);
      } else if (state) {
        state = {
          ...state,
          tabs: state.tabs.map((t) =>
            t.id === state.activeTabId ? { ...t, body: ta.value } : t
          ),
        };
        renderTabs();
      }
    });
  }

  function init() {
    const bootstrap = readBootstrap();
    const ta = textarea();
    if (!ta) return;

    if (isEncrypted() && ta.dataset.decrypted !== "true") {
      // Wait for E2E decrypt to call loadPlaintext.
      state = createWorkspace("", {
        language: wrapEl()?.dataset.language || null,
      });
      renderTabs();
      syncLanguageSelect(getActiveTab(state).language);
    } else if (bootstrap && Array.isArray(bootstrap.tabs)) {
      state = {
        v: WORKSPACE_VERSION,
        tabs: bootstrap.tabs.map((t) => ({
          id: t.id,
          title: clampTitle(t.title),
          body: t.body,
          language: t.language ?? null,
        })),
        activeTabId: bootstrap.activeTabId,
      };
      // Textarea already has active body from SSR.
      const active = getActiveTab(state);
      if (ta.value !== active.body && !isEncrypted()) {
        // Keep SSR body as source of truth for active tab.
        state = {
          ...state,
          tabs: state.tabs.map((t) =>
            t.id === active.id ? { ...t, body: ta.value } : t
          ),
        };
      }
      renderTabs();
      updateCharCount();
      syncLanguageSelect(getActiveTab(state).language);
    } else {
      loadPlaintext(ta.value);
    }

    bind();
    syncLanguageSelect(state ? getActiveTab(state).language : null);

    window.WebklipWorkspace = {
      getState() {
        flushActiveBody();
        return state;
      },
      getSerializedPlaintext,
      loadPlaintext,
      applyRemoteWorkspace,
      applyRemoteTabUpdate,
      selectTab,
      addTab: addNewTab,
      closeTab,
      isWorkspaceDocument,
      serializeWorkspace,
      parseWorkspace,
      getActiveTabId() {
        return state?.activeTabId ?? null;
      },
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
