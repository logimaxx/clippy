(function () {
  const MIN_LEN = 8;
  const MAX_TTL_SEC = 31536000;
  const EXPIRES_CUSTOM = "custom";

  function publicModal() {
    return document.querySelector("[data-public-modal]");
  }

  function publicClearModal() {
    return document.querySelector("[data-public-clear-modal]");
  }

  function e2eSetupModal() {
    return document.querySelector("[data-e2e-setup-modal]");
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

  function protectionLabels(el) {
    const labels = [];
    if (el.dataset.hasPin === "true") labels.push("legacy PIN");
    if (el.dataset.encrypted === "true") labels.push("passphrase E2E");
    if (el.dataset.burnOnRead === "true") labels.push("burn-after-read");
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

  async function publish(slug, password) {
    if (typeof htmx === "undefined") return;
    const values = {
      visibility: "public",
      ownerPassword: password,
    };
    const ta = document.getElementById("clip-content");
    if (
      ta?.dataset.encrypted === "true" &&
      window.WebklipE2E?.hasKey() &&
      ta.dataset.decrypted === "true"
    ) {
      values.content =
        window.WebklipWorkspace?.getSerializedPlaintext?.() ?? ta.value;
      values.protect = "none";
    } else if (ta?.dataset.encrypted === "true" && !window.WebklipE2E?.hasKey()) {
      window.WebklipE2E?.showPassphraseGate?.({
        error: "Unlock with your passphrase before publishing",
      });
      return;
    }
    htmx.ajax("POST", `/${slug}/settings`, {
      target: "#settings-root",
      swap: "outerHTML",
      values,
    });
    if (ta?.dataset.encrypted === "true") {
      window.WebklipE2E?.clearSession?.(slug);
      ta.dataset.encrypted = "false";
      delete ta.dataset.e2eSalt;
      delete ta.dataset.e2eWrappedKey;
      delete ta.dataset.e2eKdf;
      delete ta.dataset.decrypted;
      const wrap = document.getElementById("clip-editor-wrap");
      if (wrap) {
        wrap.dataset.encrypted = "false";
        delete wrap.dataset.decrypted;
      }
      window.WebklipEditor?.refresh?.();
    }
  }

  let pendingAccess = null;

  function currentAccessMode() {
    const published = document.querySelector('[data-access-option="published"]');
    if (
      published instanceof HTMLInputElement &&
      published.dataset.visibility === "public"
    ) {
      return "published";
    }
    const protectedOpt = document.querySelector('[data-access-option="protected"]');
    if (
      protectedOpt instanceof HTMLInputElement &&
      (protectedOpt.dataset.encrypted === "true" ||
        protectedOpt.dataset.hasPin === "true")
    ) {
      return "protected";
    }
    return "private";
  }

  function syncAccessRadios(mode) {
    document.querySelectorAll("[data-access-option]").forEach((el) => {
      if (!(el instanceof HTMLInputElement)) return;
      el.checked = el.value === mode;
    });
  }

  function clipSlug() {
    return (
      document.querySelector("[data-access-option]")?.dataset?.slug ||
      document.querySelector("[data-e2e-setup-modal]")?.dataset?.slug ||
      document.getElementById("clip-content")?.dataset?.wsRoom ||
      ""
    );
  }

  function goPrivate(input) {
    const slug = input.dataset.slug || clipSlug();
    if (!slug) return;

    if (input.dataset.visibility === "public") {
      if (typeof htmx !== "undefined") {
        htmx.ajax("POST", `/${slug}/settings`, {
          target: "#settings-root",
          swap: "outerHTML",
          values: { visibility: "private" },
        });
      }
      return;
    }

    if (input.dataset.encrypted === "true") {
      removePassphraseProtect();
      return;
    }

    if (input.dataset.hasPin === "true") {
      if (typeof htmx !== "undefined") {
        htmx.ajax("POST", `/${slug}/settings`, {
          target: "#settings-root",
          swap: "outerHTML",
          values: { protect: "none" },
        });
      }
    }
  }

  function goProtected(input) {
    if (input.dataset.encrypted === "true") {
      syncAccessRadios("protected");
      return;
    }

    syncAccessRadios(currentAccessMode());

    if (input.dataset.visibility === "public") {
      const slug = input.dataset.slug || clipSlug();
      if (!slug || typeof htmx === "undefined") return;
      pendingAccess = "protected";
      htmx.ajax("POST", `/${slug}/settings`, {
        target: "#settings-root",
        swap: "outerHTML",
        values: { visibility: "private" },
      });
      return;
    }

    openE2eSetupModal("enable");
  }

  function goPublished(input) {
    syncAccessRadios(currentAccessMode());
    const slug = input.dataset.slug || clipSlug();
    if (!slug) return;
    beginPublishFlow(
      slug,
      input.dataset.hasOwnerPassword === "true",
      protectionLabels(input)
    );
  }

  function handleAccessChange(input) {
    const option = input.dataset.accessOption;
    if (option === "private") {
      goPrivate(input);
      return true;
    }
    if (option === "protected") {
      goProtected(input);
      return true;
    }
    if (option === "published") {
      goPublished(input);
      return true;
    }
    return false;
  }

  function closeSectionHelp(except) {
    document.querySelectorAll("[data-section-help]").forEach((btn) => {
      if (except && btn === except) return;
      if (!(btn instanceof HTMLElement)) return;
      btn.setAttribute("aria-expanded", "false");
      const tip = btn.parentElement?.querySelector(".section-help__tip");
      if (tip instanceof HTMLElement) tip.hidden = true;
    });
  }

  function toggleSectionHelp(btn) {
    const tip = btn.parentElement?.querySelector(".section-help__tip");
    if (!(tip instanceof HTMLElement)) return;
    const open = btn.getAttribute("aria-expanded") === "true";
    closeSectionHelp();
    if (!open) {
      btn.setAttribute("aria-expanded", "true");
      tip.hidden = false;
    }
  }

  function setSetupError(message) {
    const el = document.querySelector("[data-e2e-setup-error]");
    if (!(el instanceof HTMLElement)) return;
    if (!message) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = message;
  }

  function syncWeakWarning() {
    const input = document.querySelector("[data-e2e-setup-passphrase]");
    const warn = document.querySelector("[data-e2e-setup-weak]");
    const ackWrap = document.querySelector("[data-e2e-setup-weak-ack]");
    if (!(input instanceof HTMLInputElement)) return;
    const weak = window.WebklipE2E?.isWeakPassphrase?.(input.value) ?? false;
    if (warn instanceof HTMLElement) warn.hidden = !weak;
    if (ackWrap instanceof HTMLElement) ackWrap.hidden = !weak;
    if (!weak) {
      const ack = document.querySelector("[data-e2e-setup-ack]");
      if (ack instanceof HTMLInputElement) ack.checked = false;
    }
  }

  function fillGeneratedPhrase() {
    const input = document.querySelector("[data-e2e-setup-passphrase]");
    if (!(input instanceof HTMLInputElement) || !window.WebklipE2E) return;
    input.value = window.WebklipE2E.generateMemorablePhrase();
    syncWeakWarning();
  }

  function closeE2eSetupModal() {
    const el = e2eSetupModal();
    if (!el) return;
    el.hidden = true;
    el.dataset.mode = "";
    document.body.style.overflow = "";
    setSetupError("");
    syncAccessRadios(currentAccessMode());
  }

  function openE2eSetupModal(mode) {
    const el = e2eSetupModal();
    if (!el || !window.WebklipE2E) return;
    el.dataset.mode = mode || "enable";
    const title = el.querySelector("#e2e-setup-title");
    const confirm = el.querySelector("[data-e2e-setup-confirm]");
    if (title) {
      title.textContent = mode === "change" ? "Change passphrase" : "Set passphrase";
    }
    if (confirm) {
      confirm.textContent = mode === "change" ? "Save passphrase" : "Enable E2E";
    }
    fillGeneratedPhrase();
    el.hidden = false;
    document.body.style.overflow = "hidden";
    const input = document.querySelector("[data-e2e-setup-passphrase]");
    if (input instanceof HTMLInputElement) input.focus();
  }

  function applyE2eMetaToEditor(salt, wrapped, kdfJson) {
    const ta = document.getElementById("clip-content");
    const wrap = document.getElementById("clip-editor-wrap");
    if (ta) {
      ta.dataset.encrypted = "true";
      ta.dataset.e2eSalt = salt;
      ta.dataset.e2eWrappedKey = wrapped;
      ta.dataset.e2eKdf = kdfJson;
      ta.dataset.decrypted = "true";
      ta.disabled = false;
    }
    if (wrap) {
      wrap.dataset.encrypted = "true";
      wrap.dataset.decrypted = "true";
    }
    window.WebklipEditor?.refresh?.();
  }

  async function enablePassphraseProtect(passphrase, mode) {
    const slug = clipSlug();
    if (!slug || !window.WebklipE2E) return;
    const ta = document.getElementById("clip-content");
    const plaintext =
      window.WebklipWorkspace?.getSerializedPlaintext?.() ?? (ta ? ta.value : "");

    if (mode === "change" && !window.WebklipE2E.hasKey()) {
      setSetupError("Unlock the clip with the current passphrase first");
      return;
    }

    const enabled = await window.WebklipE2E.enablePassphraseProtection(passphrase);
    const { saltB64, wrappedKeyB64, kdf, dek } = enabled;

    window.WebklipE2E.writeSessionDek(slug, dek, passphrase);
    const ciphertext = plaintext.trim()
      ? await window.WebklipE2E.encrypt(plaintext)
      : "";
    const kdfJson = JSON.stringify(kdf);

    if (typeof htmx === "undefined") return;
    htmx.ajax("POST", `/${slug}/settings`, {
      target: "#settings-root",
      swap: "outerHTML",
      values: {
        protect: "passphrase",
        e2eSalt: saltB64,
        e2eWrappedKey: wrappedKeyB64,
        e2eKdf: kdfJson,
        content: ciphertext,
      },
    });

    if (ta) {
      applyE2eMetaToEditor(saltB64, wrappedKeyB64, kdfJson);
      if (window.WebklipWorkspace?.loadPlaintext) {
        window.WebklipWorkspace.loadPlaintext(plaintext);
      } else {
        ta.value = plaintext;
      }
    }
  }

  async function removePassphraseProtect() {
    const slug = clipSlug();
    if (!slug || !window.WebklipE2E) return;
    const ta = document.getElementById("clip-content");

    if (!window.WebklipE2E.hasKey()) {
      window.WebklipE2E.showPassphraseGate({
        error: "Unlock with your passphrase before removing protection",
      });
      syncAccessRadios(currentAccessMode());
      return;
    }

    const plaintext =
      window.WebklipWorkspace?.getSerializedPlaintext?.() ?? (ta ? ta.value : "");
    window.WebklipE2E.clearSession(slug);

    if (typeof htmx === "undefined") return;
    htmx.ajax("POST", `/${slug}/settings`, {
      target: "#settings-root",
      swap: "outerHTML",
      values: {
        protect: "none",
        content: plaintext,
      },
    });

    if (ta) {
      ta.dataset.encrypted = "false";
      delete ta.dataset.e2eSalt;
      delete ta.dataset.e2eWrappedKey;
      delete ta.dataset.e2eKdf;
      delete ta.dataset.decrypted;
      ta.disabled = false;
    }
    const wrap = document.getElementById("clip-editor-wrap");
    if (wrap) {
      wrap.dataset.encrypted = "false";
      delete wrap.dataset.decrypted;
    }
    if (window.WebklipWorkspace?.loadPlaintext) {
      window.WebklipWorkspace.loadPlaintext(plaintext);
    } else if (ta) {
      ta.value = plaintext;
    }
    window.WebklipEditor?.refresh?.();
  }

  function handleProtectChange(input) {
    const option = input.dataset.protectOption;
    const slug = clipSlug();
    if (!slug) return true;

    if (option === "none") {
      if (input.dataset.encrypted === "true") {
        syncAccessRadios(currentAccessMode());
        removePassphraseProtect();
        return true;
      }
      if (typeof htmx !== "undefined") {
        htmx.ajax("POST", `/${slug}/settings`, {
          target: "#settings-root",
          swap: "outerHTML",
          values: { protect: "none" },
        });
      }
      return true;
    }

    if (option === "passphrase") {
      if (input.dataset.encrypted === "true") {
        syncAccessRadios("protected");
        return true;
      }
      syncAccessRadios(currentAccessMode());
      openE2eSetupModal("enable");
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
      if (toggle instanceof HTMLInputElement && toggle.matches("[data-access-option]")) {
        e.stopImmediatePropagation();
        handleAccessChange(toggle);
        return;
      }

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
        e.stopImmediatePropagation();
        handleProtectChange(toggle);
        return;
      }

      if (
        toggle instanceof HTMLInputElement &&
        toggle.matches("[data-e2e-setup-passphrase]")
      ) {
        syncWeakWarning();
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

  document.body.addEventListener("input", (e) => {
    const target = e.target;
    if (
      target instanceof HTMLInputElement &&
      target.matches("[data-e2e-setup-passphrase]")
    ) {
      syncWeakWarning();
    }
  });

  document.body.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;

    const helpBtn = target.closest("[data-section-help]");
    if (helpBtn instanceof HTMLElement) {
      e.preventDefault();
      e.stopPropagation();
      toggleSectionHelp(helpBtn);
      return;
    }

    if (!target.closest(".section-help")) {
      closeSectionHelp();
    }

    if (target.closest("[data-e2e-setup-cancel]")) {
      closeE2eSetupModal();
      return;
    }

    if (target.closest("[data-e2e-setup-regenerate]")) {
      fillGeneratedPhrase();
      return;
    }

    if (target.closest("[data-e2e-setup-confirm]")) {
      const input = document.querySelector("[data-e2e-setup-passphrase]");
      if (!(input instanceof HTMLInputElement)) return;
      const passphrase = input.value.trim();
      if (!passphrase) {
        setSetupError("Enter a passphrase");
        return;
      }
      const weak = window.WebklipE2E?.isWeakPassphrase?.(passphrase);
      const ack = document.querySelector("[data-e2e-setup-ack]");
      if (weak && (!(ack instanceof HTMLInputElement) || !ack.checked)) {
        setSetupError("Acknowledge the short-passphrase risk to continue");
        return;
      }
      setSetupError("");
      const mode = e2eSetupModal()?.dataset?.mode || "enable";
      const confirmBtn = target.closest("[data-e2e-setup-confirm]");
      if (confirmBtn instanceof HTMLButtonElement) confirmBtn.disabled = true;
      enablePassphraseProtect(passphrase, mode)
        .then(() => closeE2eSetupModal())
        .catch((err) => {
          setSetupError(err?.message || "Could not enable encryption");
        })
        .finally(() => {
          if (confirmBtn instanceof HTMLButtonElement) confirmBtn.disabled = false;
        });
      return;
    }

    if (target.closest("[data-e2e-copy-passphrase]")) {
      const pass = window.WebklipE2E?.readSessionPassphrase?.(clipSlug());
      if (!pass) {
        alert("Passphrase is only available in this browser session after unlock.");
        return;
      }
      navigator.clipboard.writeText(pass).catch(() => {});
      return;
    }

    if (target.closest("[data-e2e-change-passphrase]")) {
      openE2eSetupModal("change");
      return;
    }

    if (target.closest("[data-e2e-remove-protect]")) {
      removePassphraseProtect();
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
    const setup = e2eSetupModal();
    if (setup && !setup.hidden && e.key === "Escape") {
      e.preventDefault();
      closeE2eSetupModal();
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
    if (e.detail.target?.id !== "settings-root") return;
    closePublicClearModal();
    closePublicModal();
    closeExpiresModal();
    if (pendingAccess === "protected") {
      pendingAccess = null;
      openE2eSetupModal("enable");
      return;
    }
    closeE2eSetupModal();
  });
})();
