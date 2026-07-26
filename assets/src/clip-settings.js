(function () {
  const MIN_LEN = 8;
  const MAX_TTL_SEC = 31536000;
  const EXPIRES_CUSTOM = "custom";

  let pendingProtect = null;

  function publicModal() {
    return document.querySelector("[data-public-modal]");
  }

  function publicClearModal() {
    return document.querySelector("[data-public-clear-modal]");
  }

  function protectSwitchModal() {
    return document.querySelector("[data-protect-switch-modal]");
  }

  function publicErrorEl() {
    return document.getElementById("public-owner-error");
  }

  function passwordInput() {
    return document.getElementById("public-owner-password");
  }

  function setPublicError(message) {
    const el = publicErrorEl();
    if (!el) return;
    if (!message) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = message;
  }

  function closePublicModal() {
    const el = publicModal();
    if (!el) return;
    el.hidden = true;
    document.body.style.overflow = "";
    setPublicError("");
    const input = passwordInput();
    if (input) input.value = "";
  }

  function openPublicModal(slug, hasOwnerPassword) {
    const el = publicModal();
    if (!el) return;
    el.dataset.slug = slug;
    el.dataset.hasOwnerPassword = hasOwnerPassword ? "true" : "false";
    el.hidden = false;
    document.body.style.overflow = "hidden";
    setPublicError("");
    const input = passwordInput();
    if (input) {
      input.value = "";
      input.focus();
    }
  }

  function protectionLabels(toggle) {
    const labels = [];
    if (toggle.dataset.hasPin === "true") labels.push("PIN");
    if (toggle.dataset.encrypted === "true") labels.push("E2E encryption");
    if (toggle.dataset.burnOnRead === "true") labels.push("burn-after-read");
    return labels;
  }

  function formatClearBody(labels) {
    if (labels.length === 1) {
      return `Publishing on Klipwall clears ${labels[0]}. Continue?`;
    }
    if (labels.length === 2) {
      return `Publishing on Klipwall clears ${labels[0]} and ${labels[1]}. Continue?`;
    }
    const last = labels[labels.length - 1];
    const head = labels.slice(0, -1).join(", ");
    return `Publishing on Klipwall clears ${head}, and ${last}. Continue?`;
  }

  function closePublicClearModal() {
    const el = publicClearModal();
    if (!el) return;
    el.hidden = true;
    document.body.style.overflow = "";
  }

  function openPublicClearModal(slug, hasOwnerPassword, labels) {
    const el = publicClearModal();
    if (!el) return;
    el.dataset.slug = slug;
    el.dataset.hasOwnerPassword = hasOwnerPassword ? "true" : "false";
    const body = el.querySelector("[data-public-clear-modal-body]");
    if (body) body.textContent = formatClearBody(labels);
    el.hidden = false;
    document.body.style.overflow = "hidden";
    const confirmBtn = el.querySelector("[data-public-clear-modal-confirm]");
    if (confirmBtn instanceof HTMLElement) confirmBtn.focus();
  }

  function beginPublishFlow(slug, hasOwnerPassword, labels) {
    if (labels.length > 0) {
      openPublicClearModal(slug, hasOwnerPassword, labels);
      return;
    }
    openPublicModal(slug, hasOwnerPassword);
  }

  function publish(slug, password) {
    if (typeof htmx === "undefined") return;
    htmx.ajax("POST", `/${slug}/settings`, {
      target: "#settings-root",
      swap: "outerHTML",
      values: {
        visibility: "public",
        ownerPassword: password,
      },
    });
  }

  function currentProtectMode() {
    const pin = document.querySelector('[data-protect-option="pin"]');
    const e2e = document.querySelector('[data-protect-option="e2e"]');
    if (pin instanceof HTMLInputElement && pin.dataset.hasPin === "true") return "pin";
    if (e2e instanceof HTMLInputElement && e2e.dataset.encrypted === "true") return "e2e";
    return "none";
  }

  function syncProtectRadios(mode) {
    document.querySelectorAll("[data-protect-option]").forEach((el) => {
      if (!(el instanceof HTMLInputElement)) return;
      el.checked = el.value === mode;
    });
  }

  function showPinFields() {
    const fields = document.querySelector("[data-protect-pin-fields]");
    if (fields instanceof HTMLElement) {
      fields.hidden = false;
      const input = fields.querySelector("input[name='pin']");
      if (input instanceof HTMLInputElement) input.focus();
    }
  }

  function closeProtectSwitchModal() {
    const el = protectSwitchModal();
    if (!el) return;
    el.hidden = true;
    document.body.style.overflow = "";
    pendingProtect = null;
  }

  function openProtectSwitchModal(slug, target, message) {
    const el = protectSwitchModal();
    if (!el) return;
    pendingProtect = { slug, target };
    el.dataset.slug = slug;
    const body = el.querySelector("[data-protect-switch-body]");
    if (body) body.textContent = message;
    el.hidden = false;
    document.body.style.overflow = "hidden";
    const confirmBtn = el.querySelector("[data-protect-switch-confirm]");
    if (confirmBtn instanceof HTMLElement) confirmBtn.focus();
  }

  function enableE2e(slug) {
    if (typeof htmx === "undefined") return;
    htmx.ajax("POST", `/${slug}/settings`, {
      target: "#settings-root",
      swap: "outerHTML",
      values: { protect: "e2e" },
    });
  }

  function handleProtectChange(input) {
    const option = input.dataset.protectOption;
    if (!option || option === "none") return false;

    const hasPin = input.dataset.hasPin === "true";
    const encrypted = input.dataset.encrypted === "true";
    const slug =
      document.querySelector("[data-public-toggle]")?.dataset?.slug ||
      document.querySelector("[data-protect-switch-modal]")?.dataset?.slug;
    if (!slug) return true;

    if (option === "pin") {
      if (hasPin) {
        syncProtectRadios("pin");
        showPinFields();
        return true;
      }
      if (encrypted) {
        syncProtectRadios(currentProtectMode());
        openProtectSwitchModal(
          slug,
          "pin",
          "Enabling PIN turns off E2E encryption. Continue?"
        );
        return true;
      }
      syncProtectRadios("pin");
      showPinFields();
      return true;
    }

    if (option === "e2e") {
      if (encrypted) return true;
      syncProtectRadios(currentProtectMode());
      if (hasPin) {
        openProtectSwitchModal(
          slug,
          "e2e",
          "Enabling E2E encryption clears the PIN. Continue?"
        );
        return true;
      }
      enableE2e(slug);
      return true;
    }

    return false;
  }

  function expiresModal() {
    return document.querySelector("[data-expires-modal]");
  }

  function expiresErrorEl() {
    return document.getElementById("custom-expires-error");
  }

  function expiresInput() {
    return document.getElementById("custom-expires-at");
  }

  function setExpiresError(message) {
    const el = expiresErrorEl();
    if (!el) return;
    if (!message) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = message;
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function toLocalInputValue(unixSec) {
    const d = new Date(unixSec * 1000);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function closeExpiresModal() {
    const el = expiresModal();
    if (!el) return;
    el.hidden = true;
    document.body.style.overflow = "";
    setExpiresError("");
  }

  function openExpiresModal(slug, expiresAtSec) {
    const el = expiresModal();
    const input = expiresInput();
    if (!el || !input) return;

    el.dataset.slug = slug;
    el.hidden = false;
    document.body.style.overflow = "hidden";
    setExpiresError("");

    const nowSec = Math.floor(Date.now() / 1000);
    const minSec = nowSec + 60;
    const maxSec = nowSec + MAX_TTL_SEC;
    const initial =
      expiresAtSec && expiresAtSec > minSec
        ? Math.min(expiresAtSec, maxSec)
        : nowSec + 900;

    input.min = toLocalInputValue(minSec);
    input.max = toLocalInputValue(maxSec);
    input.value = toLocalInputValue(initial);
    input.focus();
  }

  function saveCustomExpiry(slug, expiresAtSec) {
    if (typeof htmx === "undefined") return;
    htmx.ajax("POST", `/${slug}/settings`, {
      target: "#settings-root",
      swap: "outerHTML",
      values: { expiresAt: String(expiresAtSec) },
    });
  }

  function syncExpiresSelects(value) {
    document.querySelectorAll("[data-expires-select]").forEach((sel) => {
      if (sel instanceof HTMLSelectElement) sel.value = value;
    });
  }

  document.body.addEventListener(
    "focusin",
    (e) => {
      const sel = e.target;
      if (!(sel instanceof HTMLSelectElement)) return;
      if (!sel.matches("[data-expires-select]")) return;
      sel.dataset.previousExpires = sel.value;
    },
    true
  );

  document.body.addEventListener(
    "change",
    (e) => {
      const toggle = e.target;
      if (toggle instanceof HTMLInputElement && toggle.matches("[data-public-toggle]")) {
        if (!toggle.checked) return;

        e.stopImmediatePropagation();
        toggle.checked = false;
        const slug = toggle.dataset.slug;
        if (!slug) return;
        beginPublishFlow(
          slug,
          toggle.dataset.hasOwnerPassword === "true",
          protectionLabels(toggle)
        );
        return;
      }

      if (
        toggle instanceof HTMLInputElement &&
        toggle.matches("[data-protect-option]")
      ) {
        if (toggle.dataset.protectOption === "none") return;
        e.stopImmediatePropagation();
        handleProtectChange(toggle);
        return;
      }

      const sel = e.target;
      if (!(sel instanceof HTMLSelectElement)) return;
      if (!sel.matches("[data-expires-select]")) return;
      if (sel.value !== EXPIRES_CUSTOM) return;

      e.stopImmediatePropagation();
      const previous = sel.dataset.previousExpires || "900";
      sel.value = previous;
      syncExpiresSelects(previous);

      const slug = sel.dataset.slug;
      if (!slug) return;
      const raw = sel.dataset.expiresAt;
      const expiresAtSec = raw ? Number(raw) : NaN;
      openExpiresModal(slug, Number.isFinite(expiresAtSec) ? expiresAtSec : null);
    },
    true
  );

  document.body.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;

    if (target.closest("[data-protect-switch-cancel]")) {
      closeProtectSwitchModal();
      syncProtectRadios(currentProtectMode());
      return;
    }

    if (target.closest("[data-protect-switch-confirm]")) {
      const pending = pendingProtect;
      closeProtectSwitchModal();
      if (!pending) return;
      if (pending.target === "pin") {
        syncProtectRadios("pin");
        showPinFields();
        return;
      }
      if (pending.target === "e2e") {
        enableE2e(pending.slug);
      }
      return;
    }

    if (target.closest("[data-public-clear-modal-cancel]")) {
      closePublicClearModal();
      return;
    }

    if (target.closest("[data-public-clear-modal-confirm]")) {
      const el = publicClearModal();
      if (!el) return;
      const slug = el.dataset.slug;
      if (!slug) return;
      const hasOwnerPassword = el.dataset.hasOwnerPassword === "true";
      closePublicClearModal();
      openPublicModal(slug, hasOwnerPassword);
      return;
    }

    if (target.closest("[data-public-modal-cancel]")) {
      closePublicModal();
      return;
    }

    if (target.closest("[data-expires-modal-cancel]")) {
      closeExpiresModal();
      return;
    }

    if (target.closest("[data-public-modal-confirm]")) {
      const el = publicModal();
      const input = passwordInput();
      if (!el || !input) return;

      const slug = el.dataset.slug;
      const password = input.value;
      if (!slug) return;

      if (password.length < MIN_LEN) {
        setPublicError(`Owner password must be at least ${MIN_LEN} characters`);
        input.focus();
        return;
      }

      closePublicModal();
      publish(slug, password);
      return;
    }

    if (!target.closest("[data-expires-modal-confirm]")) return;

    const el = expiresModal();
    const input = expiresInput();
    if (!el || !input) return;

    const slug = el.dataset.slug;
    if (!slug) return;

    const parsed = Date.parse(input.value);
    if (!Number.isFinite(parsed)) {
      setExpiresError("Choose a valid date and time");
      input.focus();
      return;
    }

    const expiresAtSec = Math.floor(parsed / 1000);
    const nowSec = Math.floor(Date.now() / 1000);
    if (expiresAtSec <= nowSec) {
      setExpiresError("Expiry must be in the future");
      input.focus();
      return;
    }
    if (expiresAtSec > nowSec + MAX_TTL_SEC) {
      setExpiresError("Expiry cannot be more than 1 year away");
      input.focus();
      return;
    }

    closeExpiresModal();
    saveCustomExpiry(slug, expiresAtSec);
  });

  document.body.addEventListener("keydown", (e) => {
    const protect = protectSwitchModal();
    if (protect && !protect.hidden && e.key === "Escape") {
      e.preventDefault();
      closeProtectSwitchModal();
      syncProtectRadios(currentProtectMode());
      return;
    }
    const clear = publicClearModal();
    if (clear && !clear.hidden && e.key === "Escape") {
      e.preventDefault();
      closePublicClearModal();
      return;
    }
    const pub = publicModal();
    if (pub && !pub.hidden && e.key === "Escape") {
      e.preventDefault();
      closePublicModal();
      return;
    }
    const exp = expiresModal();
    if (exp && !exp.hidden && e.key === "Escape") {
      e.preventDefault();
      closeExpiresModal();
    }
  });

  document.body.addEventListener("htmx:afterSwap", (e) => {
    if (e.detail.target?.id === "settings-root") {
      closeProtectSwitchModal();
      closePublicClearModal();
      closePublicModal();
      closeExpiresModal();
    }
  });
})();
