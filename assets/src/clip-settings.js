(function () {
  const MIN_LEN = 8;

  function modal() {
    return document.querySelector("[data-public-modal]");
  }

  function errorEl() {
    return document.getElementById("public-owner-error");
  }

  function passwordInput() {
    return document.getElementById("public-owner-password");
  }

  function setError(message) {
    const el = errorEl();
    if (!el) return;
    if (!message) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = message;
  }

  function closeModal() {
    const el = modal();
    if (!el) return;
    el.hidden = true;
    document.body.style.overflow = "";
    setError("");
    const input = passwordInput();
    if (input) input.value = "";
  }

  function openModal(slug, hasOwnerPassword) {
    const el = modal();
    if (!el) return;
    el.dataset.slug = slug;
    el.dataset.hasOwnerPassword = hasOwnerPassword ? "true" : "false";
    el.hidden = false;
    document.body.style.overflow = "hidden";
    setError("");
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

  document.body.addEventListener(
    "change",
    (e) => {
      const toggle = e.target;
      if (!(toggle instanceof HTMLInputElement)) return;
      if (!toggle.matches("[data-public-toggle]")) return;

      // Turning off uses HTMX on the checkbox itself.
      if (!toggle.checked) return;

      // Turning on: revert UI and ask for owner password.
      e.stopImmediatePropagation();
      toggle.checked = false;
      const slug = toggle.dataset.slug;
      if (!slug) return;
      openModal(slug, toggle.dataset.hasOwnerPassword === "true");
    },
    true
  );

  document.body.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;

    if (target.closest("[data-public-modal-cancel]")) {
      closeModal();
      return;
    }

    if (!target.closest("[data-public-modal-confirm]")) return;

    const el = modal();
    const input = passwordInput();
    if (!el || !input) return;

    const slug = el.dataset.slug;
    const password = input.value;
    if (!slug) return;

    if (password.length < MIN_LEN) {
      setError(`Owner password must be at least ${MIN_LEN} characters`);
      input.focus();
      return;
    }

    closeModal();
    publish(slug, password);
  });

  document.body.addEventListener("keydown", (e) => {
    const el = modal();
    if (!el || el.hidden) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeModal();
    }
  });

  document.body.addEventListener("htmx:afterSwap", (e) => {
    if (e.detail.target?.id === "settings-root") closeModal();
  });
})();
