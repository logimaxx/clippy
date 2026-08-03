/* Webklip real-time workspace sync */
(async function () {
  if (window.WebklipE2EDecryptReady) {
    await window.WebklipE2EDecryptReady;
  }

  const textarea = document.getElementById("clip-content");
  if (!textarea) return;

  const slug = textarea.dataset.wsRoom;
  const wsPath = textarea.dataset.wsUrl || `/ws/${slug}`;
  if (!slug) return;

  const syncKey = `__webklipSync_${slug}`;
  if (window[syncKey]) {
    window[syncKey].stop();
  }

  function isEncrypted() {
    return textarea.dataset.encrypted === "true";
  }

  let ws;
  let isRemote = false;
  let debounceTimer;
  let reconnectTimer;
  let reconnectDelay = 2000;
  let stopped = false;
  let intentionalClose = false;
  const pending = [];

  async function wireContent(text) {
    if (isEncrypted() && window.WebklipE2E?.hasKey()) {
      return await window.WebklipE2E.encrypt(text);
    }
    return text;
  }

  async function plainContent(wire) {
    if (!window.WebklipE2E?.hasKey()) return wire;
    const trimmed = wire.trim();
    if (!window.WebklipE2E.isLikelyCiphertext(trimmed)) return wire;
    try {
      return await window.WebklipE2E.decrypt(trimmed);
    } catch {
      return wire;
    }
  }

  function sendRaw(obj) {
    const payload = JSON.stringify(obj);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
      return;
    }
    pending.push(payload);
  }

  function flushPending() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    while (pending.length) {
      ws.send(pending.shift());
    }
  }

  function scheduleReconnect() {
    if (stopped) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      reconnectDelay = Math.min(Math.round(reconnectDelay * 1.5), 30000);
      connect();
    }, reconnectDelay);
  }

  function closeSocket() {
    if (!ws) return;
    intentionalClose = true;
    ws.onclose = null;
    ws.onerror = null;
    ws.onmessage = null;
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
    ws = null;
    intentionalClose = false;
  }

  function stop() {
    stopped = true;
    clearTimeout(reconnectTimer);
    clearTimeout(debounceTimer);
    closeSocket();
    delete window[syncKey];
  }

  function maxContentLength() {
    const raw = Number(textarea.dataset.maxContentLength);
    return Number.isFinite(raw) && raw > 0 ? raw : 1_000_000;
  }

  let lastTooLargeToast = 0;

  function toastError(message) {
    if (!message) return;
    document.body.dispatchEvent(
      new CustomEvent("showToast", { detail: { message } })
    );
  }

  function contentTooLargeMessage() {
    return `Content too large (max ${maxContentLength().toLocaleString()} characters)`;
  }

  function assertWithinLimit(content) {
    if (typeof content !== "string" || content.length <= maxContentLength()) {
      return true;
    }
    const now = Date.now();
    if (now - lastTooLargeToast > 4000) {
      lastTooLargeToast = now;
      toastError(contentTooLargeMessage());
    }
    return false;
  }

  async function sendFullDocument() {
    if (textarea.disabled) return;
    const plain =
      window.WebklipWorkspace?.getSerializedPlaintext?.() ?? textarea.value;
    if (!assertWithinLimit(plain)) return;
    const content = await wireContent(plain);
    if (!assertWithinLimit(content)) return;
    sendRaw({ type: "update", content });
  }

  function sendTabUpdate(tabId, body) {
    if (textarea.disabled) return;
    if (isEncrypted()) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        sendFullDocument();
      }, 150);
      return;
    }
    const plain =
      window.WebklipWorkspace?.getSerializedPlaintext?.() ?? String(body ?? "");
    if (!assertWithinLimit(plain)) return;
    sendRaw({ type: "tab_update", tabId, body });
  }

  function sendTabsMeta(detail) {
    if (textarea.disabled) return;
    if (isEncrypted()) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        sendFullDocument();
      }, 150);
      return;
    }
    const plain = window.WebklipWorkspace?.getSerializedPlaintext?.();
    if (plain != null && !assertWithinLimit(plain)) return;
    const { type: _t, ...rest } = detail;
    sendRaw({ type: "tabs_meta", ...rest });
  }

  function connect() {
    if (stopped) return;
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
      return;
    }

    closeSocket();

    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${proto}//${location.host}${wsPath}`);

    ws.onopen = () => {
      reconnectDelay = 2000;
      flushPending();
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "update" && typeof data.content === "string") {
          isRemote = true;
          const plain = await plainContent(data.content);
          if (window.WebklipWorkspace?.isWorkspaceDocument?.(plain)) {
            window.WebklipWorkspace.loadPlaintext(plain);
          } else if (window.WebklipWorkspace) {
            window.WebklipWorkspace.applyRemoteTabUpdate?.(
              window.WebklipWorkspace.getActiveTabId(),
              plain
            );
          } else {
            textarea.value = plain;
            window.WebklipEditor?.refresh();
          }
          isRemote = false;
        } else if (data.type === "tab_update" && data.tabId) {
          isRemote = true;
          window.WebklipWorkspace?.applyRemoteTabUpdate?.(data.tabId, data.body ?? "");
          isRemote = false;
        } else if (data.type === "tabs_meta" && data.workspace) {
          isRemote = true;
          window.WebklipWorkspace?.applyRemoteWorkspace?.(data.workspace);
          isRemote = false;
        } else if (data.type === "file_added" && data.fileId) {
          window.WebklipFiles?.appendAttachment?.({
            fileId: data.fileId,
            filename: data.filename,
            size: data.size,
            mimeType: data.mimeType,
            isImage: data.isImage,
            url: data.url,
            deleteUrl: data.deleteUrl ?? `/${slug}/files/${data.fileId}`,
          });
        } else if (data.type === "file_removed" && data.fileId) {
          window.WebklipFiles?.removeAttachment?.(data.fileId);
        } else if (data.type === "status") {
          const n = data.devices ?? 0;
          const label = `${n} device${n === 1 ? "" : "s"}`;
          const count = document.getElementById("device-count");
          if (count) {
            count.textContent = String(n);
            const chip = count.closest(".chip");
            if (chip instanceof HTMLElement) {
              chip.setAttribute("aria-label", label);
              chip.title = label;
            }
          }
        } else if (data.type === "redirect" && typeof data.url === "string") {
          stop();
          location.assign(data.url);
        } else if (data.type === "error" && data.message) {
          toastError(String(data.message));
        }
      } catch (_) {}
    };

    ws.onclose = () => {
      ws = null;
      if (stopped || intentionalClose) return;
      scheduleReconnect();
    };

    ws.onerror = () => {};
  }

  document.addEventListener("webklip-workspace", (e) => {
    if (isRemote || textarea.disabled) return;
    const detail = e.detail || {};
    if (detail.type === "tab_update") {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        sendTabUpdate(detail.tabId, detail.body ?? "");
      }, 150);
    } else if (detail.type === "tabs_meta") {
      // Structural changes must not be coalesced away by typing debounce.
      sendTabsMeta(detail);
    }
  });

  // Legacy path: direct textarea input still syncs when workspace events missing
  textarea.addEventListener("input", () => {
    if (isRemote || textarea.disabled) return;
    if (window.WebklipWorkspace) return; // handled via webklip-workspace
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const content = await wireContent(textarea.value);
      sendRaw({ type: "update", content });
    }, 150);
  });

  window.addEventListener("pagehide", stop, { once: true });

  window[syncKey] = { stop };
  connect();
})();
