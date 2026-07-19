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

  function closeSheets() {
    const backdrop = getBackdrop();
    const sheets = getSheets();
    if (!backdrop) return;
    backdrop.classList.remove("is-open");
    Object.values(sheets).forEach((sheet) => sheet?.classList.remove("is-open"));
    window.setTimeout(() => {
      backdrop.hidden = true;
      Object.values(sheets).forEach((sheet) => {
        if (sheet) sheet.hidden = true;
      });
      document.body.style.overflow = "";
      openSheetName = null;
    }, 280);
  }

  function updateCharCount() {
    const editor = document.getElementById("clip-content");
    const counter = document.getElementById("char-count");
    if (!editor || !counter) return;
    const len = editor.value.length;
    counter.textContent = `${len} char${len === 1 ? "" : "s"} · saved`;
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

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeShareMenu();
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
        const qrUrl = item.dataset.qrUrl;
        if (qrUrl) window.open(qrUrl, "_blank");
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

  mobileQuery.addEventListener("change", syncFormFieldsets);
  init();

  document.body.addEventListener("htmx:afterSwap", (e) => {
    if (e.detail.target?.id !== "settings-root") return;
    init();
    if (openSheetName) openSheet(openSheetName);
  });

  window.WebklipMobile = { openSheet, closeSheets };
})();
