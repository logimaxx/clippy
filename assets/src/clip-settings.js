(function () {
  const MIN_LEN = 8;
  const MAX_TTL_SEC = 31536000;
  const EXPIRES_CUSTOM = "custom";

  function publicModal() {
    return document.querySelector("[data-public-modal]");
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
        // Turning off uses HTMX on the checkbox itself.
        if (!toggle.checked) return;

        // Turning on: revert UI and ask for owner password.
        e.stopImmediatePropagation();
        toggle.checked = false;
        const slug = toggle.dataset.slug;
        if (!slug) return;
        openPublicModal(slug, toggle.dataset.hasOwnerPassword === "true");
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
      closePublicModal();
      closeExpiresModal();
    }
  });
})();
