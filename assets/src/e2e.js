/* Webklip E2E encryption — AES-256-GCM, key in URL fragment (#key=) */
(function () {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  function b64UrlToBytes(b64url) {
    let b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4;
    if (pad) b64 += "=".repeat(4 - pad);
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function keyFromHash() {
    const m = location.hash.match(/#key=([A-Za-z0-9_-]+)/);
    if (!m) return null;
    try {
      const bytes = b64UrlToBytes(m[1]);
      return bytes.length === 32 ? bytes : null;
    } catch {
      return null;
    }
  }

  function bytesToB64(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function isLikelyCiphertext(value) {
    const trimmed = value.trim();
    return trimmed.length >= 28 && /^[A-Za-z0-9_-]+$/.test(trimmed);
  }

  async function importKey(raw) {
    return crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
      "encrypt",
      "decrypt",
    ]);
  }

  async function encrypt(plaintext, keyBytes) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await importKey(keyBytes);
    const ct = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encoder.encode(plaintext)
    );
    const out = new Uint8Array(iv.length + ct.byteLength);
    out.set(iv, 0);
    out.set(new Uint8Array(ct), iv.length);
    return bytesToB64(out);
  }

  async function decrypt(payload, keyBytes) {
    const data = b64UrlToBytes(payload.trim());
    if (data.length < 13) throw new Error("Ciphertext too short");
    const iv = data.slice(0, 12);
    const ct = data.slice(12);
    const key = await importKey(keyBytes);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return decoder.decode(pt);
  }

  function generateKey() {
    const raw = crypto.getRandomValues(new Uint8Array(32));
    return { raw, b64: bytesToB64(raw) };
  }

  async function initClipDecrypt() {
    const ta = document.getElementById("clip-content");
    if (!ta || ta.dataset.encrypted !== "true") return;

    if (!window.WebklipE2E.hasKey()) {
      ta.placeholder = "Enter encryption key in URL (#key=...) to decrypt";
      ta.disabled = true;
      return;
    }

    const stored = ta.value.trim();
    if (!stored) {
      ta.dataset.decrypted = "true";
      ta.disabled = false;
      return;
    }

    if (!isLikelyCiphertext(stored)) {
      ta.dataset.decrypted = "true";
      ta.disabled = false;
      if (stored) {
        ta.dispatchEvent(new Event("input", { bubbles: true }));
      }
      return;
    }

    try {
      ta.value = await window.WebklipE2E.decrypt(stored);
      ta.dataset.decrypted = "true";
      ta.disabled = false;
      window.WebklipEditor?.refresh();
    } catch {
      ta.value = "";
      ta.placeholder = "Wrong encryption key";
      ta.disabled = true;
    }
  }

  window.WebklipE2E = {
    hasKey() {
      return !!keyFromHash();
    },
    getKeyBytes() {
      return keyFromHash();
    },
    isLikelyCiphertext,
    async encrypt(plaintext) {
      const k = keyFromHash();
      if (!k) throw new Error("No E2E key in URL");
      return encrypt(plaintext, k);
    },
    async decrypt(ciphertext) {
      const k = keyFromHash();
      if (!k) throw new Error("No E2E key in URL");
      return decrypt(ciphertext, k);
    },
    enableEncryption() {
      const { b64 } = generateKey();
      history.replaceState(
        null,
        "",
        location.pathname + location.search + "#key=" + b64
      );
      return b64;
    },
    shareUrl() {
      return location.href;
    },
    initClipDecrypt,
  };

  window.WebklipE2EDecryptReady = initClipDecrypt();
})();
