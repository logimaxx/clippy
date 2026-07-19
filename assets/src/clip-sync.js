/* Webklip real-time textarea sync */
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
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "update" && typeof data.content === "string") {
          isRemote = true;
          textarea.value = await plainContent(data.content);
          isRemote = false;
          window.WebklipEditor?.refresh();
        } else if (data.type === "status") {
          const n = data.devices ?? 0;
          const label = `${n} device${n === 1 ? "" : "s"}`;
          const desktop = document.getElementById("device-count-desktop");
          if (desktop) desktop.textContent = label;
          const mobile = document.getElementById("device-count");
          if (mobile) mobile.textContent = label;
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

  textarea.addEventListener("input", () => {
    if (isRemote || textarea.disabled) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        const content = await wireContent(textarea.value);
        ws.send(JSON.stringify({ type: "update", content }));
      }
    }, 150);
  });

  window.addEventListener("pagehide", stop, { once: true });

  window[syncKey] = { stop };
  connect();
})();
