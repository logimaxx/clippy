/* PWA install + service worker registration */
(function () {
  const THEME_KEY = "webklip-theme";

  function getDefaultTheme() {
    return document.documentElement.dataset.themeDefault === "dark"
      ? "dark"
      : "light";
  }

  function getStoredTheme() {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      return stored === "light" || stored === "dark" ? stored : getDefaultTheme();
    } catch {
      return getDefaultTheme();
    }
  }

  function getTheme() {
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  }

  function updateThemeColor(theme) {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute("content", theme === "light" ? "#f0f7f5" : "#071216");
    }
  }

  function updateThemeToggle(btn, theme) {
    const next = theme === "light" ? "dark" : "light";
    btn.setAttribute(
      "aria-label",
      next === "light" ? "Switch to light theme" : "Switch to dark theme"
    );
  }

  function syncThemeToggle() {
    const theme = getTheme();
    const btn = document.getElementById("theme-toggle");
    if (btn) updateThemeToggle(btn, theme);

    const checkbox = document.querySelector("[data-theme-toggle]");
    if (!(checkbox instanceof HTMLInputElement)) return;
    checkbox.checked = theme === "dark";
    const label = checkbox
      .closest("label")
      ?.querySelector("[data-theme-toggle-label]");
    if (label) label.textContent = theme === "dark" ? "Dark" : "Light";
  }

  function applyTheme(theme, persist) {
    document.documentElement.dataset.theme = theme;
    updateThemeColor(theme);
    syncThemeToggle();
    if (persist) {
      try {
        localStorage.setItem(THEME_KEY, theme);
      } catch {
        /* ignore */
      }
    }
    document.dispatchEvent(
      new CustomEvent("webklip-theme-change", { detail: { theme } })
    );
  }

  function initTheme() {
    applyTheme(getStoredTheme(), false);
    document.addEventListener("click", (e) => {
      const toggle = e.target instanceof Element ? e.target.closest("#theme-toggle") : null;
      if (!toggle) return;
      applyTheme(getTheme() === "light" ? "dark" : "light", true);
    });
    document.addEventListener("change", (e) => {
      const el = e.target;
      if (!(el instanceof HTMLInputElement) || !el.matches("[data-theme-toggle]")) return;
      applyTheme(el.checked ? "dark" : "light", true);
    });
  }

  initTheme();

  if (window.htmx) {
    window.htmx.config.allowScriptTags = false;
    document.body.addEventListener("htmx:afterSwap", syncThemeToggle);
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("__SW_URL__").catch(() => {});
    });
  }

  function isStandaloneDisplay() {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: window-controls-overlay)").matches ||
      // iOS Safari
      Boolean(navigator.standalone)
    );
  }

  function isIosSafari() {
    const ua = navigator.userAgent;
    const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const webkit = /WebKit/.test(ua);
    const chrome = /CriOS|FxiOS|EdgiOS|OPiOS|Chrome/.test(ua);
    return iOS && webkit && !chrome;
  }

  let deferredPrompt;
  const installBtn = document.getElementById("install-pwa");
  const iosHint = document.getElementById("install-ios-hint");

  if (installBtn) {
    installBtn.addEventListener("click", () => {
      window.webklipInstall?.();
    });
  }

  iosHint?.querySelector("[data-dismiss-ios-install]")?.addEventListener("click", () => {
    iosHint.hidden = true;
    try {
      localStorage.setItem("webklip-ios-install-dismissed", "1");
    } catch {
      /* ignore */
    }
  });

  if (isStandaloneDisplay()) {
    if (installBtn) installBtn.hidden = true;
    if (iosHint) iosHint.hidden = true;
  } else {
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredPrompt = e;
      if (installBtn) installBtn.hidden = false;
      if (iosHint) iosHint.hidden = true;
    });

    window.addEventListener("appinstalled", () => {
      deferredPrompt = null;
      if (installBtn) installBtn.hidden = true;
      if (iosHint) iosHint.hidden = true;
    });

    if (isIosSafari() && iosHint) {
      let dismissed = false;
      try {
        dismissed = localStorage.getItem("webklip-ios-install-dismissed") === "1";
      } catch {
        /* ignore */
      }
      if (!dismissed) iosHint.hidden = false;
    }
  }

  window.webklipInstall = async function () {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (installBtn) installBtn.hidden = true;
  };

  function showToast(message) {
    if (!message) return;
    let host = document.getElementById("toast-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "toast-host";
      host.className = "toast-host";
      host.setAttribute("aria-live", "polite");
      host.setAttribute("aria-atomic", "true");
      document.body.prepend(host);
    }

    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    host.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add("toast-visible"));

    const hideMs = 2800;
    const fadeMs = 220;
    window.setTimeout(() => {
      toast.classList.remove("toast-visible");
      window.setTimeout(() => toast.remove(), fadeMs);
    }, hideMs);
  }

  document.body.addEventListener("showToast", (e) => {
    const detail = e.detail;
    const message =
      typeof detail === "string"
        ? detail
        : detail && typeof detail.message === "string"
          ? detail.message
          : "";
    showToast(message);
  });

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const PREVIEW_EXT = new Set([
    "png",
    "jpg",
    "jpeg",
    "gif",
    "webp",
    "svg",
    "bmp",
    "ico",
    "avif",
    "pdf",
    "txt",
    "md",
    "markdown",
    "csv",
    "tsv",
    "json",
    "xml",
    "html",
    "htm",
    "css",
    "js",
    "mjs",
    "cjs",
    "ts",
    "tsx",
    "jsx",
    "yaml",
    "yml",
    "toml",
    "sql",
    "log",
    "mp4",
    "webm",
    "ogg",
    "mp3",
    "wav",
    "m4a",
  ]);

  const TEXT_PREVIEW_MIMES = new Set([
    "application/json",
    "application/xml",
    "application/javascript",
    "application/xhtml+xml",
    "application/yaml",
    "application/x-yaml",
    "application/toml",
    "application/sql",
  ]);

  const MAX_TEXT_PREVIEW_BYTES = 2 * 1024 * 1024;

  function fileExtension(filename) {
    const i = String(filename || "").lastIndexOf(".");
    return i >= 0 ? String(filename).slice(i + 1).toLowerCase() : "";
  }

  function isPreviewableFile(mimeType, filename) {
    const mime = String(mimeType || "").toLowerCase();
    if (
      mime.startsWith("image/") ||
      mime.startsWith("video/") ||
      mime.startsWith("audio/") ||
      mime.startsWith("text/") ||
      mime === "application/pdf" ||
      TEXT_PREVIEW_MIMES.has(mime)
    ) {
      return true;
    }
    return PREVIEW_EXT.has(fileExtension(filename));
  }

  function previewKind(mimeType, filename) {
    const mime = String(mimeType || "").toLowerCase();
    const ext = fileExtension(filename);
    if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif"].includes(ext)) {
      return "image";
    }
    if (mime.startsWith("video/") || ["mp4", "webm"].includes(ext)) {
      return "video";
    }
    if (mime.startsWith("audio/") || ["mp3", "wav", "m4a", "ogg"].includes(ext)) {
      return "audio";
    }
    if (mime === "application/pdf" || ext === "pdf") {
      return "pdf";
    }
    if (mime.startsWith("text/") || TEXT_PREVIEW_MIMES.has(mime) || PREVIEW_EXT.has(ext)) {
      return "text";
    }
    return null;
  }

  function renderAttachment(data) {
    const name = escapeHtml(data.filename);
    const fileId = escapeHtml(data.fileId);
    const url = escapeHtml(data.url);
    const deleteUrl = escapeHtml(data.deleteUrl ?? "");
    const mimeRaw = data.mimeType ?? "application/octet-stream";
    const mime = escapeHtml(mimeRaw);
    const sizeBytes = Number(data.size) || 0;
    const size = Math.max(1, Math.round(sizeBytes / 1024));
    const isImage = data.isImage;
    const canPreview = isPreviewableFile(mimeRaw, data.filename);

    const icon = isImage
      ? `<div class="file-card__icon" aria-hidden="true">🖼</div>`
      : `<div class="file-card__icon" aria-hidden="true">📄</div>`;

    const nameEl = canPreview
      ? `<button type="button" class="file-card__name file-card__name--preview" data-preview-file aria-label="Preview ${name}">${name}</button>`
      : `<div class="file-card__name">${name}</div>`;

    const previewBtn = canPreview
      ? `<button type="button" class="btn btn--ghost btn--icon btn--sm" data-preview-file aria-label="Preview ${name}">👁</button>`
      : "";

    return (
      `<div class="file-card file-attachment" data-file-id="${fileId}" data-file-url="${url}" data-file-name="${name}" data-file-mime="${mime}" data-file-size="${sizeBytes}"${canPreview ? ' data-previewable="true"' : ""}>` +
      `${icon}` +
      `<div class="file-card__info">` +
      `${nameEl}` +
      `<div class="file-card__meta">${size} KB · ${mime}</div>` +
      `</div>` +
      `${previewBtn}` +
      `<a href="${url}" class="btn btn--ghost btn--icon btn--sm" download="${name}" aria-label="Download ${name}">↓</a>` +
      `<button type="button" class="btn btn--ghost btn--icon btn--sm file-delete-btn" data-delete-url="${deleteUrl}" aria-label="Remove ${name}">×</button>` +
      `</div>`
    );
  }

  let previewObjectUrl = null;
  let previewLoadToken = 0;

  function getPreviewModal() {
    return document.querySelector("[data-file-preview-modal]");
  }

  function isFilePreviewOpen() {
    const backdrop = getPreviewModal();
    return Boolean(backdrop && !backdrop.hidden);
  }

  function revokePreviewObjectUrl() {
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = null;
    }
  }

  function syncFilePreviewScrollLock() {
    if (typeof window.WebklipMobile?.syncBodyScrollLock === "function") {
      window.WebklipMobile.syncBodyScrollLock();
      return;
    }
    document.body.style.overflow = isFilePreviewOpen() ? "hidden" : "";
  }

  function closeFilePreview() {
    const backdrop = getPreviewModal();
    const modal = document.getElementById("file-preview-modal");
    const body = document.getElementById("file-preview-body");
    if (!backdrop || !modal || backdrop.hidden) return false;
    previewLoadToken += 1;
    backdrop.classList.remove("is-open");
    window.setTimeout(() => {
      backdrop.hidden = true;
      modal.hidden = true;
      revokePreviewObjectUrl();
      if (body) {
        body.replaceChildren();
        const loading = document.createElement("p");
        loading.className = "file-preview-modal__loading";
        loading.textContent = "Loading preview…";
        body.append(loading);
      }
      syncFilePreviewScrollLock();
    }, 220);
    return true;
  }

  function setPreviewLoading(body) {
    body.replaceChildren();
    const loading = document.createElement("p");
    loading.className = "file-preview-modal__loading";
    loading.textContent = "Loading preview…";
    body.append(loading);
  }

  function setPreviewMessage(body, message, downloadUrl, filename) {
    body.replaceChildren();
    const wrap = document.createElement("div");
    wrap.className = "file-preview-modal__fallback";
    const p = document.createElement("p");
    p.textContent = message;
    wrap.append(p);
    if (downloadUrl) {
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.className = "btn btn--primary btn--sm";
      link.download = filename || "";
      link.textContent = "Download file";
      wrap.append(link);
    }
    body.append(wrap);
  }

  async function renderFilePreview(body, { url, filename, mimeType, size }) {
    const kind = previewKind(mimeType, filename);
    const token = previewLoadToken;

    if (!kind) {
      setPreviewMessage(body, "This file type can’t be previewed in the browser.", url, filename);
      return;
    }

    if (kind === "image") {
      const img = document.createElement("img");
      img.className = "file-preview-modal__image";
      img.src = url;
      img.alt = filename || "Image preview";
      body.replaceChildren(img);
      return;
    }

    if (kind === "video") {
      const video = document.createElement("video");
      video.className = "file-preview-modal__video";
      video.src = url;
      video.controls = true;
      video.playsInline = true;
      body.replaceChildren(video);
      return;
    }

    if (kind === "audio") {
      const audio = document.createElement("audio");
      audio.className = "file-preview-modal__audio";
      audio.src = url;
      audio.controls = true;
      body.replaceChildren(audio);
      return;
    }

    if (kind === "pdf") {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to load file");
        if (token !== previewLoadToken) return;
        const blob = await res.blob();
        if (token !== previewLoadToken) return;
        revokePreviewObjectUrl();
        previewObjectUrl = URL.createObjectURL(blob);
        const iframe = document.createElement("iframe");
        iframe.className = "file-preview-modal__frame";
        iframe.title = filename || "PDF preview";
        iframe.src = previewObjectUrl;
        body.replaceChildren(iframe);
      } catch {
        if (token !== previewLoadToken) return;
        setPreviewMessage(body, "Couldn’t load PDF preview.", url, filename);
      }
      return;
    }

    // text
    if (size > MAX_TEXT_PREVIEW_BYTES) {
      setPreviewMessage(
        body,
        "This file is too large to preview. Download it to view the contents.",
        url,
        filename
      );
      return;
    }

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load file");
      if (token !== previewLoadToken) return;
      const text = await res.text();
      if (token !== previewLoadToken) return;
      const pre = document.createElement("pre");
      pre.className = "file-preview-modal__text";
      pre.textContent = text;
      body.replaceChildren(pre);
    } catch {
      if (token !== previewLoadToken) return;
      setPreviewMessage(body, "Couldn’t load text preview.", url, filename);
    }
  }

  async function openFilePreview(card) {
    const backdrop = getPreviewModal();
    const modal = document.getElementById("file-preview-modal");
    const body = document.getElementById("file-preview-body");
    const title = document.getElementById("file-preview-title");
    const download = document.getElementById("file-preview-download");
    if (!backdrop || !modal || !body || !(card instanceof HTMLElement)) return;

    const url = card.dataset.fileUrl;
    const filename = card.dataset.fileName || "file";
    const mimeType = card.dataset.fileMime || "application/octet-stream";
    const size = Number(card.dataset.fileSize) || 0;
    if (!url) return;

    previewLoadToken += 1;
    revokePreviewObjectUrl();

    if (title) title.textContent = filename;
    if (download instanceof HTMLAnchorElement) {
      download.href = url;
      download.download = filename;
    }

    setPreviewLoading(body);
    backdrop.hidden = false;
    modal.hidden = false;
    requestAnimationFrame(() => {
      backdrop.classList.add("is-open");
    });
    syncFilePreviewScrollLock();

    await renderFilePreview(body, { url, filename, mimeType, size });
  }

  function initFilePreviewModal() {
    const backdrop = getPreviewModal();
    if (!backdrop || backdrop.dataset.bound === "1") return;
    backdrop.dataset.bound = "1";

    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeFilePreview();
    });

    backdrop.querySelectorAll("[data-close-file-preview]").forEach((btn) => {
      btn.addEventListener("click", closeFilePreview);
    });
  }

  initFilePreviewModal();

  function getFilesList() {
    return document.getElementById("clip-files-list") || document.querySelector(".clip-files-list");
  }

  function clearEmptyState() {
    document.getElementById("clip-files-empty")?.remove();
  }

  function showEmptyState() {
    const list = getFilesList();
    if (!list || list.querySelector(".file-attachment")) return;
    if (document.getElementById("clip-files-empty")) return;
    list.insertAdjacentHTML(
      "beforeend",
      '<div id="clip-files-empty" class="empty-state">No files attached yet.</div>'
    );
  }

  function updateFilesPanelMeta() {
    const meta = document.getElementById("files-panel-meta");
    if (!meta) return;
    const cards = document.querySelectorAll("#clip-files-list .file-attachment, .clip-files-list .file-attachment");
    if (cards.length === 0) {
      meta.textContent = "0 files";
      return;
    }
    let totalBytes = 0;
    cards.forEach((card) => {
      totalBytes += Number(card.dataset.fileSize) || 0;
    });
    const kb = Math.max(1, Math.round(totalBytes / 1024));
    meta.textContent = `${cards.length} file${cards.length === 1 ? "" : "s"} · ${kb} KB`;
  }

  function readUploadLimits(form) {
    return {
      maxFiles: Number(form?.dataset.maxFiles) || 10,
      maxFileMb: Number(form?.dataset.maxFileSizeMb) || 10,
      maxTotalMb: Number(form?.dataset.maxTotalFilesMb) || 50,
    };
  }

  function existingAttachmentStats() {
    const cards = document.querySelectorAll(
      "#clip-files-list .file-attachment, .clip-files-list .file-attachment"
    );
    let bytes = 0;
    cards.forEach((card) => {
      bytes += Number(card.dataset.fileSize) || 0;
    });
    return { count: cards.length, bytes };
  }

  /** Client-side check before upload; returns an error string or null. */
  function validateUploadBatch(files, form, existing) {
    const { maxFiles, maxFileMb, maxTotalMb } = readUploadLimits(form);
    const maxFileBytes = maxFileMb * 1024 * 1024;
    const maxTotalBytes = maxTotalMb * 1024 * 1024;
    const existingCount = existing?.count ?? 0;
    const existingBytes = existing?.bytes ?? 0;

    if (existingCount + files.length > maxFiles) {
      return `Maximum ${maxFiles} files per clip`;
    }
    let batchBytes = 0;
    for (const file of files) {
      if (file.size > maxFileBytes) {
        return `File too large (max ${maxFileMb} MB)`;
      }
      batchBytes += file.size;
    }
    if (existingBytes + batchBytes > maxTotalBytes) {
      return `Total attachments too large (max ${maxTotalMb} MB)`;
    }
    return null;
  }

  function appendAttachment(data) {
    const list = getFilesList();
    if (!list) return;
    const fileId = data.fileId != null ? String(data.fileId) : "";
    if (fileId && list.querySelector(`[data-file-id="${CSS.escape(fileId)}"]`)) {
      updateFilesPanelMeta();
      return;
    }
    clearEmptyState();
    list.insertAdjacentHTML("beforeend", renderAttachment(data));
    updateFilesPanelMeta();
    list.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function removeAttachment(fileId) {
    if (!fileId) return;
    const list = getFilesList();
    const card = list?.querySelector(`[data-file-id="${CSS.escape(String(fileId))}"]`);
    if (card) card.remove();
    showEmptyState();
    updateFilesPanelMeta();
  }

  window.WebklipFiles = {
    closePreview: closeFilePreview,
    isPreviewOpen: isFilePreviewOpen,
    appendAttachment,
    removeAttachment,
  };

  async function uploadFile(url, file, status) {
    const body = new FormData();
    body.append("file", file);

    const res = await fetch(url, {
      method: "POST",
      body,
      headers: { Accept: "application/json" },
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      const message =
        typeof data?.error === "string" ? data.error : "Upload failed";
      throw new Error(message);
    }

    appendAttachment({
      ...data,
      deleteUrl: `/${data.slug}/files/${data.fileId}`,
    });

    if (status) {
      status.innerHTML = `<span class="success">Uploaded <strong>${escapeHtml(data.filename)}</strong></span>`;
    }
    return data;
  }

  document.addEventListener("change", async (e) => {
    const input = e.target;
    if (!(input instanceof HTMLInputElement) || input.type !== "file") return;
    const form = input.closest("form.upload-form");
    if (!form || !input.files?.length) return;

    const url = form.dataset.uploadUrl;
    if (!url) return;

    const status = form.querySelector(".upload-status");
    const selected = Array.from(input.files);
    const limitError = validateUploadBatch(selected, form, existingAttachmentStats());
    if (limitError) {
      if (status) status.innerHTML = `<span class="error">${escapeHtml(limitError)}</span>`;
      input.value = "";
      return;
    }

    try {
      for (let i = 0; i < selected.length; i++) {
        if (status) {
          status.textContent =
            selected.length > 1
              ? `Uploading ${i + 1}/${selected.length}…`
              : "Uploading…";
        }
        await uploadFile(url, selected[i], status);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      if (status) status.innerHTML = `<span class="error">${escapeHtml(message)}</span>`;
    } finally {
      input.value = "";
    }
  });

  /** Clipboard screenshots often arrive as image.png / empty name. */
  function namedClipboardImage(file) {
    const raw = (file.name || "").trim();
    const generic =
      !raw ||
      raw === "blob" ||
      /^image\.(png|jpe?g|webp|gif|bmp)$/i.test(raw);
    if (!generic) return file;
    const subtype = (file.type.split("/")[1] || "png").split("+")[0];
    const ext = subtype === "jpeg" ? "jpg" : subtype;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    return new File([file], `screenshot-${stamp}.${ext}`, {
      type: file.type || "image/png",
      lastModified: Date.now(),
    });
  }

  function clipboardImageFiles(clipboardData) {
    if (!clipboardData) return [];
    const out = [];
    const push = (file) => {
      if (file && file.type.startsWith("image/")) out.push(namedClipboardImage(file));
    };
    for (const file of clipboardData.files || []) push(file);
    if (out.length) return out;
    for (const item of clipboardData.items || []) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        push(item.getAsFile());
      }
    }
    return out;
  }

  function assignFilesToInput(input, files) {
    const dt = new DataTransfer();
    for (const file of files) dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // Ctrl/Cmd+V screenshot → attach as file (clip page) or select on landing upload hero
  document.addEventListener("paste", (e) => {
    const images = clipboardImageFiles(e.clipboardData);
    if (!images.length) return;

    const clipInput = document.querySelector(
      "form.upload-form input[type='file']"
    );
    if (clipInput instanceof HTMLInputElement) {
      e.preventDefault();
      assignFilesToInput(clipInput, images);
      return;
    }

    const landingInput = document.querySelector(
      "form.landing-hero-upload input[type='file']"
    );
    if (landingInput instanceof HTMLInputElement) {
      e.preventDefault();
      assignFilesToInput(landingInput, images);
    }
  });

  document.addEventListener("click", async (e) => {
    const previewTrigger = e.target.closest("[data-preview-file]");
    if (previewTrigger) {
      const card = previewTrigger.closest(".file-attachment");
      if (card?.dataset.previewable === "true") {
        e.preventDefault();
        openFilePreview(card);
        return;
      }
    }

    const btn = e.target.closest(".file-delete-btn");
    if (!btn) return;

    const deleteUrl = btn.dataset.deleteUrl;
    const attachment = btn.closest(".file-attachment");
    const fileId = attachment?.dataset.fileId;
    if (!deleteUrl || !attachment || !fileId) return;

    btn.disabled = true;

    try {
      const res = await fetch(deleteUrl, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        const message =
          typeof data?.error === "string" ? data.error : "Delete failed";
        throw new Error(message);
      }
      removeAttachment(fileId);
    } catch (err) {
      btn.disabled = false;
      const message = err instanceof Error ? err.message : "Delete failed";
      alert(message);
    }
  });

  const siteHeader = document.querySelector(".site-header");
  const navToggle = document.querySelector(".site-nav-toggle");
  const siteNav = document.getElementById("site-nav");

  if (siteHeader && navToggle && siteNav) {
    const backdrop = siteHeader.querySelector(".site-nav-backdrop");

    function setNavOpen(open) {
      siteHeader.classList.toggle("is-nav-open", open);
      navToggle.setAttribute("aria-expanded", open ? "true" : "false");
      navToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      document.body.classList.toggle("site-nav-open", open);
    }

    navToggle.addEventListener("click", () => {
      setNavOpen(!siteHeader.classList.contains("is-nav-open"));
    });

    backdrop?.addEventListener("click", () => setNavOpen(false));

    siteNav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => setNavOpen(false));
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && siteHeader.classList.contains("is-nav-open")) {
        setNavOpen(false);
        navToggle.focus();
      }
    });
  }

  // Landing "Start now" → focus the hero paste box
  document.querySelectorAll(".landing-start-now").forEach((link) => {
    link.addEventListener("click", (e) => {
      const paste = document.getElementById("home-paste");
      if (!(paste instanceof HTMLTextAreaElement)) return;
      e.preventDefault();
      paste.scrollIntoView({ behavior: "smooth", block: "center" });
      paste.focus({ preventScroll: true });
      paste.classList.add("is-start-target");
      window.setTimeout(() => paste.classList.remove("is-start-target"), 1200);
    });
  });

  // Homepage / landing create: slug availability + taken-name feedback
  (function initCreateSlugValidation() {
    const SLUG_RE = /^[a-zA-Z0-9_-]{3,64}$/;
    const DRAFT_KEY = "webklip_create_draft";
    const forms = document.querySelectorAll('form.home-form[action="/new"]');
    if (!forms.length) return;

    function clearUrlCreateParams() {
      const url = new URL(window.location.href);
      if (!url.searchParams.has("create_error") && !url.searchParams.has("create_slug")) {
        return;
      }
      url.searchParams.delete("create_error");
      url.searchParams.delete("create_slug");
      const qs = url.searchParams.toString();
      window.history.replaceState({}, "", qs ? `${url.pathname}?${qs}` : url.pathname);
    }

    /**
     * @param {HTMLElement} status
     * @param {"ok"|"error"|"idle"} kind
     * @param {string} text
     * @param {string | null} openSlug
     */
    function setStatus(status, kind, text, openSlug) {
      status.hidden = !text;
      status.classList.toggle("is-error", kind === "error");
      status.classList.toggle("is-ok", kind === "ok");
      status.replaceChildren();
      if (!text) return;
      status.append(document.createTextNode(text));
      if (openSlug) {
        status.append(document.createTextNode(" "));
        const link = document.createElement("a");
        link.href = `/${encodeURIComponent(openSlug)}`;
        link.textContent = "Open existing clip →";
        status.append(link);
      }
    }

    forms.forEach((form) => {
      if (!(form instanceof HTMLFormElement)) return;
      const slugInput = form.querySelector('input[name="slug"]');
      const contentInput = form.querySelector('textarea[name="content"]');
      const submitBtn = form.querySelector('button[type="submit"]');
      const status =
        form.querySelector(".landing-create-status") ||
        document.getElementById("create-slug-status");
      if (!(slugInput instanceof HTMLInputElement) || !(status instanceof HTMLElement)) {
        return;
      }

      let timer = 0;
      let reqId = 0;

      function setBlocked(next) {
        form.dataset.slugBlocked = next ? "1" : "";
        if (submitBtn instanceof HTMLButtonElement) {
          submitBtn.disabled = next;
        }
        slugInput.classList.toggle("is-invalid", next);
      }

      form.addEventListener("submit", () => {
        if (contentInput instanceof HTMLTextAreaElement) {
          try {
            sessionStorage.setItem(DRAFT_KEY, contentInput.value);
          } catch {
            /* ignore */
          }
        }
      });

      async function checkSlug(value) {
        const id = ++reqId;
        if (!value) {
          setBlocked(false);
          setStatus(status, "idle", "", null);
          return;
        }
        if (!SLUG_RE.test(value)) {
          setBlocked(true);
          setStatus(
            status,
            "error",
            "Use 3–64 letters, numbers, hyphens, or underscores.",
            null
          );
          return;
        }
        try {
          const res = await fetch(`/api/v1/clips/${encodeURIComponent(value)}/available`, {
            headers: { Accept: "application/json" },
          });
          if (id !== reqId) return;
          if (!res.ok) {
            setBlocked(false);
            setStatus(status, "idle", "", null);
            return;
          }
          const data = await res.json();
          if (id !== reqId) return;
          if (data.available) {
            setBlocked(false);
            setStatus(status, "ok", "Name is available.", null);
            return;
          }
          if (data.reason === "taken") {
            setBlocked(true);
            setStatus(
              status,
              "error",
              "That name is already taken.",
              value
            );
            return;
          }
          if (data.reason === "reserved") {
            setBlocked(true);
            setStatus(status, "error", "That name is reserved. Pick another.", null);
            return;
          }
          setBlocked(true);
          setStatus(
            status,
            "error",
            "Use 3–64 letters, numbers, hyphens, or underscores.",
            null
          );
        } catch {
          if (id !== reqId) return;
          setBlocked(false);
          setStatus(status, "idle", "", null);
        }
      }

      slugInput.addEventListener("input", () => {
        const value = slugInput.value.trim();
        window.clearTimeout(timer);
        if (!value) {
          reqId += 1;
          setBlocked(false);
          setStatus(status, "idle", "", null);
          return;
        }
        timer = window.setTimeout(() => checkSlug(value), 300);
      });

      form.addEventListener("submit", (e) => {
        if (form.dataset.slugBlocked === "1") e.preventDefault();
      });
    });

    const params = new URLSearchParams(window.location.search);
    const createError = params.get("create_error");
    const createSlug = (params.get("create_slug") ?? "").trim();
    if (createError === "taken" && createSlug) {
      const primary =
        document.getElementById("create-klip") ||
        document.querySelector('form.home-form[action="/new"]');
      if (primary instanceof HTMLFormElement) {
        const slugInput = primary.querySelector('input[name="slug"]');
        const contentInput = primary.querySelector('textarea[name="content"]');
        const status =
          primary.querySelector(".landing-create-status") ||
          document.getElementById("create-slug-status");
        const submitBtn = primary.querySelector('button[type="submit"]');
        if (slugInput instanceof HTMLInputElement) {
          slugInput.value = createSlug;
          slugInput.classList.add("is-invalid");
        }
        primary.dataset.slugBlocked = "1";
        if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = true;
        if (status instanceof HTMLElement) {
          status.hidden = false;
          status.classList.add("is-error");
          status.replaceChildren();
          status.append(document.createTextNode("That name is already taken. "));
          const link = document.createElement("a");
          link.href = `/${encodeURIComponent(createSlug)}`;
          link.textContent = "Open existing clip →";
          status.append(link);
        }
        if (contentInput instanceof HTMLTextAreaElement) {
          try {
            const draft = sessionStorage.getItem(DRAFT_KEY);
            if (draft != null) contentInput.value = draft;
            sessionStorage.removeItem(DRAFT_KEY);
          } catch {
            /* ignore */
          }
        }
        primary.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      clearUrlCreateParams();
    } else {
      try {
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }
    }
  })();

  // Landing page file upload drop zones (multipart create-from-hero)
  document.querySelectorAll(".landing-hero-upload").forEach((form) => {
    const zone = form.querySelector(".landing-drop-zone");
    const input = form.querySelector('input[type="file"]');
    const names = form.querySelector(".landing-file-names");
    const status = form.querySelector(".upload-status");
    if (!zone || !(input instanceof HTMLInputElement)) return;

    function setStatus(message, isError) {
      if (!(status instanceof HTMLElement)) return;
      if (!message) {
        status.replaceChildren();
        return;
      }
      const span = document.createElement("span");
      span.className = isError ? "error" : "success";
      span.textContent = message;
      status.replaceChildren(span);
    }

    function applySelectedFiles(fileList) {
      const files = Array.from(fileList || []);
      const limitError = validateUploadBatch(files, form, { count: 0, bytes: 0 });
      if (limitError) {
        input.value = "";
        if (names instanceof HTMLElement) {
          names.hidden = true;
          names.replaceChildren();
        }
        setStatus(limitError, true);
        return false;
      }
      setStatus("", false);
      return true;
    }

    function syncNames() {
      if (!(names instanceof HTMLElement)) return;
      const files = input.files ? Array.from(input.files) : [];
      if (files.length === 0) {
        names.hidden = true;
        names.replaceChildren();
        return;
      }
      names.hidden = false;
      const label = document.createElement("span");
      label.className = "landing-file-names__label";
      label.textContent =
        files.length === 1 ? "Selected file" : `${files.length} files selected`;
      const list = document.createElement("span");
      list.className = "landing-file-names__list";
      list.textContent = files.map((f) => f.name).join(", ");
      names.replaceChildren(label, list);
    }

    input.addEventListener("change", () => {
      if (!applySelectedFiles(input.files)) return;
      syncNames();
    });

    form.addEventListener("submit", (e) => {
      const files = input.files ? Array.from(input.files) : [];
      if (files.length === 0) return;
      const limitError = validateUploadBatch(files, form, { count: 0, bytes: 0 });
      if (limitError) {
        e.preventDefault();
        setStatus(limitError, true);
      }
    });

    ["dragenter", "dragover"].forEach((ev) => {
      zone.addEventListener(ev, (e) => {
        e.preventDefault();
        zone.classList.add("is-dragover");
      });
    });
    ["dragleave", "drop"].forEach((ev) => {
      zone.addEventListener(ev, (e) => {
        e.preventDefault();
        zone.classList.remove("is-dragover");
      });
    });
    zone.addEventListener("drop", (e) => {
      const dt = e.dataTransfer;
      if (!dt?.files?.length) return;
      const transfer = new DataTransfer();
      Array.from(dt.files).forEach((f) => transfer.items.add(f));
      if (!applySelectedFiles(transfer.files)) return;
      input.files = transfer.files;
      syncNames();
    });
  });

  document.addEventListener("click", (e) => {
    const btn = e.target instanceof Element ? e.target.closest("[data-copy-url]") : null;
    if (!btn) return;

    const path = btn.getAttribute("data-copy-url");
    if (!path || !navigator.clipboard?.writeText) return;

    navigator.clipboard
      .writeText(new URL(path, location.origin).href)
      .then(() => showToast("Link copied"))
      .catch(() => showToast("Could not copy the link"));
  });

  document.addEventListener("change", (e) => {
    const field = e.target;
    if (!(field instanceof Element) || !field.hasAttribute("data-autosubmit")) return;
    field.closest("form")?.requestSubmit();
  });

  document.addEventListener("click", (e) => {
    const btn =
      e.target instanceof Element ? e.target.closest("[data-password-toggle]") : null;
    if (!btn) return;

    const input = btn.closest(".password-field")?.querySelector("input");
    if (!(input instanceof HTMLInputElement)) return;

    const reveal = input.type === "password";
    input.type = reveal ? "text" : "password";
    btn.setAttribute("aria-pressed", reveal ? "true" : "false");
    btn.setAttribute("aria-label", reveal ? "Hide password" : "Show password");

    const caret = input.value.length;
    input.focus();
    try {
      input.setSelectionRange(caret, caret);
    } catch {
      /* selection is unsupported on some input types */
    }
  });
})();
