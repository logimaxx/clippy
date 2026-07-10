/* PWA install + service worker registration */
(function () {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("__SW_URL__").catch(() => {});
    });
  }

  let deferredPrompt;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const btn = document.getElementById("install-pwa");
    if (btn) btn.hidden = false;
  });

  window.clippyInstall = async function () {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
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

  document.addEventListener("click", (e) => {
    const e2eBtn = e.target.closest("#e2e-generate-key");
    if (e2eBtn && window.ClippyE2E) {
      window.ClippyE2E.enableEncryption();
      const ta = document.getElementById("clip-content");
      if (ta && ta.value.trim()) {
        ta.dispatchEvent(new Event("input", { bubbles: true }));
      }
      navigator.clipboard.writeText(window.ClippyE2E.shareUrl()).catch(() => {});
      alert(
        "Encryption key added to URL and copied to clipboard. Share this full link to decrypt."
      );
    }
  });

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderAttachment(data) {
    const name = escapeHtml(data.filename);
    const fileId = escapeHtml(data.fileId);
    const url = escapeHtml(data.url);
    const deleteUrl = escapeHtml(data.deleteUrl ?? "");
    const mime = escapeHtml(data.mimeType ?? "application/octet-stream");
    const size = Math.max(1, Math.round(data.size / 1024));
    const isImage = data.isImage;

    const icon = isImage
      ? `<div class="file-card__icon" aria-hidden="true">🖼</div>`
      : `<div class="file-card__icon" aria-hidden="true">📄</div>`;

    return (
      `<div class="file-card file-attachment" data-file-id="${fileId}">` +
      `${icon}` +
      `<div class="file-card__info">` +
      `<div class="file-card__name">${name}</div>` +
      `<div class="file-card__meta">${size} KB · ${mime}</div>` +
      `</div>` +
      `<a href="${url}" class="btn btn--ghost btn--icon btn--sm" download="${name}" aria-label="Download ${name}">↓</a>` +
      `<button type="button" class="btn btn--ghost btn--icon btn--sm file-delete-btn" data-delete-url="${deleteUrl}" aria-label="Remove ${name}">×</button>` +
      `</div>`
    );
  }

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
      '<div id="clip-files-empty" class="file-attachment-empty"><p class="field-hint">No files attached yet.</p></div>'
    );
  }

  function appendAttachment(data) {
    const list = getFilesList();
    if (!list) return;
    clearEmptyState();
    list.insertAdjacentHTML("beforeend", renderAttachment(data));
    list.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

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

  document.addEventListener("click", async (e) => {
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
      attachment.remove();
      showEmptyState();
    } catch (err) {
      btn.disabled = false;
      const message = err instanceof Error ? err.message : "Delete failed";
      alert(message);
    }
  });
})();
