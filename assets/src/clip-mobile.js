(function () {
  const app = document.querySelector(".app");
  if (!app) return;

  let openSheetName = null;

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

  function syncFormFieldsets() {
    const desktop = document.getElementById("settings-form-desktop");
    const mobile = document.getElementById("settings-form-mobile");
    if (!desktop || !mobile) return;
    const isMobile = mobileQuery.matches;
    desktop.disabled = isMobile;
    mobile.disabled = !isMobile;
  }

  function bindSelectPair(aId, bId) {
    const a = document.getElementById(aId);
    const b = document.getElementById(bId);
    if (!a || !b || a.dataset.syncBound === "1") return;
    a.dataset.syncBound = "1";
    b.dataset.syncBound = "1";
    a.addEventListener("change", () => {
      if (!b.disabled) b.value = a.value;
    });
    b.addEventListener("change", () => {
      if (!a.disabled) a.value = b.value;
    });
  }

  function openSheet(name) {
    const backdrop = getBackdrop();
    const sheets = getSheets();
    closeSheets();
    const sheet = sheets[name];
    if (!sheet || !backdrop) return;
    openSheetName = name;
    backdrop.hidden = false;
    sheet.hidden = false;
    requestAnimationFrame(() => {
      backdrop.classList.add("is-open");
      sheet.classList.add("is-open");
    });
    document.body.style.overflow = "hidden";
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

  function syncBodyScrollLock() {
    document.body.style.overflow =
      openSheetName || isQrModalOpen() || isDocsModalOpen() ? "hidden" : "";
  }

  function closeSheets() {
    const backdrop = getBackdrop();
    const sheets = getSheets();
    if (!backdrop) return;
    const wasOpen = Boolean(openSheetName);
    backdrop.classList.remove("is-open");
    Object.values(sheets).forEach((sheet) => sheet?.classList.remove("is-open"));
    openSheetName = null;
    if (!wasOpen) {
      syncBodyScrollLock();
      return;
    }
    window.setTimeout(() => {
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
    const len = editor.value.length;
    counter.textContent = `${len} char${len === 1 ? "" : "s"} · saved`;
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
        app.querySelectorAll(".bottom-nav__item").forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        if (btn.dataset.openSheet) {
          openSheet(btn.dataset.openSheet);
        } else {
          closeSheets();
        }
      });
    });
  }

  function init() {
    bindSheetControls();
    initQrModal();
    initDocsModal();
    bindDocsTriggers();
    initShareMenu();
    initDropZone();
    syncFormFieldsets();
    bindSelectPair("ttl", "m-ttl");
    bindSelectPair("language", "m-language");
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
      if (isDocsModalOpen()) {
        closeDocsModal();
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

  mobileQuery.addEventListener("change", syncFormFieldsets);
  init();

  document.body.addEventListener("htmx:afterSwap", (e) => {
    if (e.detail.target?.id !== "settings-root") return;
    init();
    if (openSheetName) openSheet(openSheetName);
  });

  window.WebklipMobile = { openSheet, closeSheets, openDocsModal, closeDocsModal };
})();
