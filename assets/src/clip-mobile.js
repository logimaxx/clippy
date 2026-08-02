(function () {
  const app = document.querySelector(".app");
  if (!app) return;

  let openSheetName = null;
  let sheetCloseToken = 0;

  function getBackdrop() {
    return document.querySelector("[data-sheet-backdrop]");
  }

  function getSheets() {
    return Object.fromEntries(
      [...document.querySelectorAll("[data-sheet]")].map((el) => [
        el.getAttribute("data-sheet"),
        el,
      ])
    );
  }

  const mobileQuery = window.matchMedia("(max-width: 767px)");

  function setFormActive(el, active) {
    if (!el) return;
    // Prefer inert over fieldset.disabled: disabled fieldsets block clicks even
    // when shown in the desktop "All settings" sheet, and interact poorly with
    // display:contents in some browsers.
    el.disabled = false;
    if (active) el.removeAttribute("inert");
    else el.setAttribute("inert", "");
  }

  function syncFormFieldsets() {
    const desktop = document.getElementById("settings-form-desktop");
    const mobile = document.getElementById("settings-form-mobile");
    if (!desktop || !mobile) return;
    const isMobile = mobileQuery.matches;
    const sheetOpen = openSheetName === "settings";
    // Desktop toolbar when wide + sheet closed; sheet/mobile form otherwise.
    const useDesktop = !isMobile && !sheetOpen;
    setFormActive(desktop, useDesktop);
    setFormActive(mobile, !useDesktop);
  }

  function syncSettingsPageOffset() {
    const header = document.querySelector(".header--clip");
    if (!header) return;
    const bottom = Math.ceil(header.getBoundingClientRect().bottom);
    document.documentElement.style.setProperty("--clip-header-offset", `${bottom}px`);
  }

  function setBottomNavActive(view) {
    app.querySelectorAll(".bottom-nav__item[data-view]").forEach((b) => {
      b.classList.toggle("is-active", b.getAttribute("data-view") === view);
    });
  }

  function syncSettingsSheetMode() {
    const sheet = document.getElementById("sheet-settings");
    if (!sheet) return;
    const mobilePage = mobileQuery.matches && openSheetName === "settings";
    sheet.classList.toggle("sheet--page", mobilePage);
    if (mobilePage) {
      sheet.setAttribute("role", "region");
      sheet.removeAttribute("aria-modal");
      syncSettingsPageOffset();
    } else {
      sheet.setAttribute("role", "dialog");
      sheet.setAttribute("aria-modal", "true");
    }
  }

  function bindSelectPair(aId, bId) {
    const a = document.getElementById(aId);
    const b = document.getElementById(bId);
    if (!a || !b || a.dataset.syncBound === "1") return;
    a.dataset.syncBound = "1";
    b.dataset.syncBound = "1";
    a.addEventListener("change", () => {
      if (!b.closest("[inert]")) b.value = a.value;
    });
    b.addEventListener("change", () => {
      if (!a.closest("[inert]")) a.value = b.value;
    });
  }

  function openSheet(name) {
    const backdrop = getBackdrop();
    const sheets = getSheets();
    const sheet = sheets[name];
    if (!sheet || !backdrop) return;

    // Invalidate any pending close animation so it cannot hide this sheet.
    sheetCloseToken += 1;
    Object.entries(sheets).forEach(([key, el]) => {
      if (!el || key === name) return;
      el.classList.remove("is-open");
      el.classList.remove("sheet--page");
      el.hidden = true;
    });

    openSheetName = name;
    const mobileSettingsPage = mobileQuery.matches && name === "settings";

    if (mobileSettingsPage) {
      app.dataset.view = "settings";
      setBottomNavActive("settings");
      backdrop.classList.remove("is-open");
      backdrop.hidden = true;
      sheet.hidden = false;
      sheet.classList.add("is-open");
      syncSettingsSheetMode();
      syncFormFieldsets();
      // Full-page panel scrolls internally; do not lock body.
      syncBodyScrollLock();
      return;
    }

    if (app.dataset.view === "settings") {
      app.dataset.view = "editor";
      setBottomNavActive("editor");
    }

    backdrop.hidden = false;
    sheet.hidden = false;
    // Apply is-open synchronously so HTMX re-opens after swap are visible
    // immediately (rAF can lose the race with layout/CSS display:none rules).
    backdrop.classList.add("is-open");
    sheet.classList.add("is-open");
    syncSettingsSheetMode();
    syncFormFieldsets();
    syncBodyScrollLock();
  }

  function isQrModalOpen() {
    const backdrop = getQrModal();
    return Boolean(backdrop && !backdrop.hidden);
  }

  function getDocsModal() {
    return document.querySelector("[data-docs-modal]");
  }

  function isDocsModalOpen() {
    const backdrop = getDocsModal();
    return Boolean(backdrop && !backdrop.hidden);
  }

  function isFilePreviewOpen() {
    const backdrop = document.querySelector("[data-file-preview-modal]");
    return Boolean(backdrop && !backdrop.hidden);
  }

  function isMdPreviewOpen() {
    const backdrop = document.querySelector("[data-md-preview-modal]");
    return Boolean(backdrop && !backdrop.hidden);
  }

  function syncBodyScrollLock() {
    const settingsLocksScroll =
      openSheetName === "settings" && !(mobileQuery.matches && app.dataset.view === "settings");
    const otherSheetOpen = Boolean(openSheetName) && openSheetName !== "settings";
    document.body.style.overflow =
      settingsLocksScroll ||
      otherSheetOpen ||
      isQrModalOpen() ||
      isDocsModalOpen() ||
      isCloneModalOpen() ||
      isFilePreviewOpen() ||
      isMdPreviewOpen()
        ? "hidden"
        : "";
  }

  function closeSheets() {
    const backdrop = getBackdrop();
    const sheets = getSheets();
    if (!backdrop) return;
    const wasOpen = Boolean(openSheetName);
    const settingsSheet = sheets.settings;
    const wasMobileSettingsPage =
      wasOpen &&
      openSheetName === "settings" &&
      Boolean(settingsSheet?.classList.contains("sheet--page"));
    const token = ++sheetCloseToken;
    backdrop.classList.remove("is-open");
    Object.values(sheets).forEach((sheet) => {
      sheet?.classList.remove("is-open");
      sheet?.classList.remove("sheet--page");
    });
    openSheetName = null;
    if (wasMobileSettingsPage && app.dataset.view === "settings") {
      app.dataset.view = "editor";
      setBottomNavActive("editor");
    }
    syncSettingsSheetMode();
    syncFormFieldsets();
    if (!wasOpen) {
      backdrop.hidden = true;
      Object.values(sheets).forEach((sheet) => {
        if (sheet) sheet.hidden = true;
      });
      syncBodyScrollLock();
      return;
    }
    // Mobile settings page has no slide animation; hide immediately.
    if (wasMobileSettingsPage) {
      backdrop.hidden = true;
      Object.values(sheets).forEach((sheet) => {
        if (sheet) sheet.hidden = true;
      });
      syncBodyScrollLock();
      return;
    }
    window.setTimeout(() => {
      if (token !== sheetCloseToken) return;
      backdrop.hidden = true;
      Object.values(sheets).forEach((sheet) => {
        if (sheet) sheet.hidden = true;
      });
      syncBodyScrollLock();
    }, 280);
  }

  function updateCharCount() {
    const editor = document.getElementById("clip-content");
    const counter = document.getElementById("char-count");
    if (!editor || !counter) return;
    // Workspace UI owns the counter when multi-tab is active.
    if (window.WebklipWorkspace?.getSerializedPlaintext) return;
    const maxRaw = Number(editor.dataset.maxContentLength);
    const max = Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : 1_000_000;
    const len = editor.value.length;
    counter.textContent = `${len.toLocaleString()} / ${max.toLocaleString()}`;
    counter.title = `Max ${max.toLocaleString()} characters`;
    counter.classList.toggle("is-over-limit", len > max);
  }

  function getQrModal() {
    return document.querySelector("[data-qr-modal]");
  }

  function openQrModal(qrUrl) {
    const backdrop = getQrModal();
    const modal = document.getElementById("qr-modal");
    const img = document.getElementById("qr-modal-img");
    if (!backdrop || !modal) return;
    if (qrUrl && img && img.getAttribute("src") !== qrUrl) {
      img.setAttribute("src", qrUrl);
    }
    closeSheets();
    backdrop.hidden = false;
    modal.hidden = false;
    requestAnimationFrame(() => {
      backdrop.classList.add("is-open");
    });
    syncBodyScrollLock();
  }

  function closeQrModal() {
    const backdrop = getQrModal();
    const modal = document.getElementById("qr-modal");
    if (!backdrop || !modal || backdrop.hidden) return;
    backdrop.classList.remove("is-open");
    window.setTimeout(() => {
      backdrop.hidden = true;
      modal.hidden = true;
      syncBodyScrollLock();
    }, 220);
  }

  function initQrModal() {
    const backdrop = getQrModal();
    if (!backdrop || backdrop.dataset.bound === "1") return;
    backdrop.dataset.bound = "1";

    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeQrModal();
    });

    backdrop.querySelectorAll("[data-close-qr-modal]").forEach((btn) => {
      btn.addEventListener("click", closeQrModal);
    });
  }

  function getCloneModal() {
    return document.querySelector("[data-clone-modal]");
  }

  function isCloneModalOpen() {
    const backdrop = getCloneModal();
    return Boolean(backdrop && !backdrop.hidden);
  }

  function openCloneModal() {
    const backdrop = getCloneModal();
    const modal = document.getElementById("clone-modal");
    const input = document.getElementById("clone-slug");
    if (!backdrop || !modal) return;
    closeSheets();
    closeQrModal();
    backdrop.hidden = false;
    modal.hidden = false;
    requestAnimationFrame(() => {
      backdrop.classList.add("is-open");
      input?.focus();
      input?.select();
    });
    syncBodyScrollLock();
  }

  function closeCloneModal() {
    const backdrop = getCloneModal();
    const modal = document.getElementById("clone-modal");
    if (!backdrop || !modal || backdrop.hidden) return;
    backdrop.classList.remove("is-open");
    window.setTimeout(() => {
      backdrop.hidden = true;
      modal.hidden = true;
      syncBodyScrollLock();
    }, 220);
  }

  function initCloneModal() {
    const backdrop = getCloneModal();
    if (!backdrop || backdrop.dataset.bound === "1") return;
    backdrop.dataset.bound = "1";

    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeCloneModal();
    });

    backdrop.querySelectorAll("[data-close-clone-modal]").forEach((btn) => {
      btn.addEventListener("click", closeCloneModal);
    });

    document.querySelectorAll("[data-open-clone-modal]").forEach((btn) => {
      if (btn.dataset.cloneBound === "1") return;
      btn.dataset.cloneBound = "1";
      btn.addEventListener("click", openCloneModal);
    });

    if (!backdrop.hidden) {
      const input = document.getElementById("clone-slug");
      requestAnimationFrame(() => input?.focus());
      syncBodyScrollLock();
    }
  }

  const DOCS_TITLES = {
    "/docs": "Developer docs",
    "/docs/api": "REST API",
    "/docs/webhooks": "Webhooks",
  };

  let docsLoadToken = 0;

  function normalizeDocsPath(path) {
    if (!path) return "/docs/api";
    try {
      const url = new URL(path, location.origin);
      if (!url.pathname.startsWith("/docs")) return "/docs/api";
      return url.pathname.replace(/\/$/, "") || "/docs";
    } catch {
      return "/docs/api";
    }
  }

  function setDocsTabs(activePath) {
    const backdrop = getDocsModal();
    if (!backdrop) return;
    backdrop.querySelectorAll("[data-docs-path].docs-modal__tab").forEach((tab) => {
      const path = normalizeDocsPath(tab.getAttribute("data-docs-path"));
      const active = path === activePath;
      tab.classList.toggle("is-active", active);
      if (active) tab.setAttribute("aria-current", "page");
      else tab.removeAttribute("aria-current");
    });
  }

  async function loadDocsContent(path) {
    const backdrop = getDocsModal();
    const body = document.getElementById("docs-modal-body");
    const title = document.getElementById("docs-modal-title");
    const openPage = document.getElementById("docs-modal-open-page");
    if (!backdrop || !body) return;

    const docsPath = normalizeDocsPath(path);
    const token = ++docsLoadToken;
    backdrop.dataset.docsPath = docsPath;
    setDocsTabs(docsPath);
    if (title) title.textContent = DOCS_TITLES[docsPath] ?? "Developer docs";
    if (openPage) openPage.setAttribute("href", docsPath);
    body.innerHTML = `<p class="docs-modal__loading">Loading documentation…</p>`;

    try {
      const res = await fetch(`${docsPath}?embed=1`, {
        headers: { Accept: "text/html" },
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      if (token !== docsLoadToken) return;
      body.innerHTML = html;
      body.scrollTop = 0;
    } catch {
      if (token !== docsLoadToken) return;
      body.innerHTML = `<p class="docs-modal__error">Could not load docs. <a href="${docsPath}" target="_blank" rel="noopener noreferrer">Open full page</a>.</p>`;
    }
  }

  function openDocsModal(path) {
    const backdrop = getDocsModal();
    const modal = document.getElementById("docs-modal");
    if (!backdrop || !modal) return;
    closeSheets();
    closeQrModal();
    backdrop.hidden = false;
    modal.hidden = false;
    requestAnimationFrame(() => {
      backdrop.classList.add("is-open");
    });
    syncBodyScrollLock();
    void loadDocsContent(path ?? backdrop.dataset.docsPath ?? "/docs/api");
    const closeBtn = backdrop.querySelector("[data-close-docs-modal]");
    closeBtn?.focus();
  }

  function closeDocsModal() {
    const backdrop = getDocsModal();
    const modal = document.getElementById("docs-modal");
    if (!backdrop || !modal || backdrop.hidden) return;
    backdrop.classList.remove("is-open");
    window.setTimeout(() => {
      backdrop.hidden = true;
      modal.hidden = true;
      syncBodyScrollLock();
    }, 220);
  }

  function initDocsModal() {
    const backdrop = getDocsModal();
    if (!backdrop || backdrop.dataset.bound === "1") return;
    backdrop.dataset.bound = "1";

    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeDocsModal();
    });

    backdrop.querySelectorAll("[data-close-docs-modal]").forEach((btn) => {
      btn.addEventListener("click", closeDocsModal);
    });

    backdrop.querySelectorAll(".docs-modal__tab[data-docs-path]").forEach((tab) => {
      tab.addEventListener("click", () => {
        void loadDocsContent(tab.getAttribute("data-docs-path"));
      });
    });

    const body = document.getElementById("docs-modal-body");
    body?.addEventListener("click", (e) => {
      const link = e.target.closest("a[href]");
      if (!link) return;
      const href = link.getAttribute("href");
      if (!href || href.startsWith("#") || link.target === "_blank") return;
      try {
        const url = new URL(href, location.origin);
        if (url.origin === location.origin && url.pathname.startsWith("/docs")) {
          e.preventDefault();
          void loadDocsContent(url.pathname);
        }
      } catch {
        /* ignore invalid href */
      }
    });
  }

  function bindDocsTriggers() {
    document.querySelectorAll("[data-open-docs-modal]").forEach((btn) => {
      if (btn.dataset.docsBound === "1") return;
      btn.dataset.docsBound = "1";
      btn.addEventListener("click", () => {
        openDocsModal(btn.getAttribute("data-docs-path"));
      });
    });
  }

  function initShareMenu() {
    const shareMenu = document.getElementById("share-menu");
    const shareTrigger = document.getElementById("share-trigger");
    const sharePopover = document.getElementById("share-popover");
    if (!shareMenu || !shareTrigger || !sharePopover || shareMenu.dataset.bound === "1") {
      return;
    }
    shareMenu.dataset.bound = "1";

    if (navigator.share) {
      shareMenu.classList.add("share-menu--native");
      const divider = sharePopover.querySelector(".share-menu__divider--native");
      if (divider) divider.hidden = false;
    }

    function setShareMenuOpen(open) {
      shareMenu.classList.toggle("is-open", open);
      shareTrigger.setAttribute("aria-expanded", String(open));
      sharePopover.hidden = !open;
    }

    function closeShareMenu() {
      setShareMenuOpen(false);
    }

    shareTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      setShareMenuOpen(!shareMenu.classList.contains("is-open"));
    });

    document.addEventListener("click", (e) => {
      if (!shareMenu.contains(e.target)) closeShareMenu();
    });

    sharePopover.addEventListener("click", async (e) => {
      const item = e.target.closest("[data-share-action]");
      if (!item) return;
      const action = item.dataset.shareAction;

      if (action === "copy") {
        try {
          await navigator.clipboard.writeText(location.href);
          document.body.dispatchEvent(
            new CustomEvent("showToast", { detail: { message: "Link copied" } })
          );
        } catch {
          document.body.dispatchEvent(
            new CustomEvent("showToast", {
              detail: { message: "Copy failed — select URL manually" },
            })
          );
        }
        closeShareMenu();
      } else if (action === "qr") {
        openQrModal(item.dataset.qrUrl);
        closeShareMenu();
      } else if (action === "clone") {
        openCloneModal();
        closeShareMenu();
      } else if (action === "native" && navigator.share) {
        try {
          await navigator.share({ title: "Webklip clip", url: location.href });
        } catch {
          /* cancelled */
        }
        closeShareMenu();
      }
    });
  }

  function initDropZone() {
    const dropZone = document.getElementById("drop-zone");
    const input = dropZone?.querySelector('input[type="file"]');
    if (!dropZone || !input || dropZone.dataset.bound === "1") return;
    dropZone.dataset.bound = "1";

    ["dragenter", "dragover"].forEach((ev) => {
      dropZone.addEventListener(ev, (e) => {
        e.preventDefault();
        dropZone.classList.add("is-dragover");
      });
    });
    ["dragleave", "drop"].forEach((ev) => {
      dropZone.addEventListener(ev, (e) => {
        e.preventDefault();
        dropZone.classList.remove("is-dragover");
      });
    });
    dropZone.addEventListener("drop", (e) => {
      if (!(e instanceof DragEvent) || !e.dataTransfer?.files?.length) return;
      input.files = e.dataTransfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  function setMobileView(view) {
    if (!view) return;
    if (view === "settings") {
      openSheet("settings");
      return;
    }
    app.dataset.view = view;
    setBottomNavActive(view);
    if (openSheetName) closeSheets();
  }

  function bindSheetControls() {
    document.querySelectorAll("[data-open-sheet]").forEach((btn) => {
      if (btn.dataset.sheetBound === "1") return;
      btn.dataset.sheetBound = "1";
      btn.addEventListener("click", () => openSheet(btn.getAttribute("data-open-sheet")));
    });

    document.querySelectorAll("[data-close-sheet]").forEach((btn) => {
      if (btn.dataset.sheetBound === "1") return;
      btn.dataset.sheetBound = "1";
      btn.addEventListener("click", closeSheets);
    });

    const backdrop = getBackdrop();
    if (backdrop && backdrop.dataset.sheetBound !== "1") {
      backdrop.dataset.sheetBound = "1";
      backdrop.addEventListener("click", closeSheets);
    }

    app.querySelectorAll(".bottom-nav__item[data-view]").forEach((btn) => {
      if (btn.dataset.navBound === "1") return;
      btn.dataset.navBound = "1";
      btn.addEventListener("click", () => {
        setMobileView(btn.getAttribute("data-view"));
      });
    });
  }

  function init() {
    bindSheetControls();
    initQrModal();
    initCloneModal();
    initDocsModal();
    bindDocsTriggers();
    initShareMenu();
    initDropZone();
    syncFormFieldsets();
    bindSelectPair("ttl", "m-ttl");
    updateCharCount();
  }

  const editor = document.getElementById("clip-content");
  if (editor && editor.dataset.charBound !== "1") {
    editor.dataset.charBound = "1";
    editor.addEventListener("input", updateCharCount);
  }

  if (!window.__webklipModalEscapeBound) {
    window.__webklipModalEscapeBound = true;
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (isFilePreviewOpen()) {
        window.WebklipFiles?.closePreview?.();
        return;
      }
      if (isMdPreviewOpen()) {
        window.WebklipEditor?.closePreview?.();
        return;
      }
      if (isDocsModalOpen()) {
        closeDocsModal();
        return;
      }
      if (isCloneModalOpen()) {
        closeCloneModal();
        return;
      }
      if (isQrModalOpen()) {
        closeQrModal();
        return;
      }
      const shareMenu = document.getElementById("share-menu");
      if (shareMenu?.classList.contains("is-open")) {
        shareMenu.classList.remove("is-open");
        const trigger = document.getElementById("share-trigger");
        const popover = document.getElementById("share-popover");
        trigger?.setAttribute("aria-expanded", "false");
        if (popover) popover.hidden = true;
        return;
      }
      if (openSheetName) closeSheets();
    });
  }

  mobileQuery.addEventListener("change", () => {
    syncFormFieldsets();
    if (openSheetName === "settings") {
      openSheet("settings");
    } else {
      syncSettingsSheetMode();
    }
  });

  window.addEventListener("resize", () => {
    if (mobileQuery.matches && app.dataset.view === "settings") {
      syncSettingsPageOffset();
    }
  });

  init();

  document.body.addEventListener("htmx:afterSettle", (e) => {
    if (e.detail.target?.id !== "settings-root") return;
    init();
    // Re-open after settle: HTMX restores `class` from the response during
    // settle, which would wipe is-open if we only ran on afterSwap.
    if (openSheetName) openSheet(openSheetName);
  });

  window.WebklipMobile = {
    openSheet,
    closeSheets,
    openDocsModal,
    closeDocsModal,
    syncBodyScrollLock,
  };
})();
