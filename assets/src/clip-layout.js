(function () {
  const workspace = document.querySelector(".clip-workspace");
  const settings = document.getElementById("settings-panel");
  const splitter = document.querySelector(".clip-workspace-splitter");
  if (!workspace || !settings || !splitter) return;

  const STORAGE_KEY = "clippy-settings-height";
  let moreOpen = false;

  function applySavedHeight() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    const h = Number(saved);
    if (!Number.isFinite(h) || h < 72) return;
    settings.style.flex = `0 0 ${h}px`;
    settings.classList.add("clip-settings-shell--sized");
  }

  applySavedHeight();

  let dragging = false;

  function setSettingsHeight(clientY) {
    const rect = workspace.getBoundingClientRect();
    const y = clientY - rect.top;
    const min = 64;
    const max = rect.height * 0.55;
    const h = Math.round(Math.max(min, Math.min(y, max)));
    settings.style.flex = `0 0 ${h}px`;
    settings.classList.add("clip-settings-shell--sized");
    localStorage.setItem(STORAGE_KEY, String(h));
  }

  splitter.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    dragging = true;
    document.body.classList.add("clip-dragging");
    e.preventDefault();
  });

  splitter.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 24 : 8;
    const current =
      settings.getBoundingClientRect().height || settings.offsetHeight;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSettingsHeight(workspace.getBoundingClientRect().top + current + step);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSettingsHeight(workspace.getBoundingClientRect().top + current - step);
    }
  });

  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    setSettingsHeight(e.clientY);
  });

  window.addEventListener("mouseup", () => {
    dragging = false;
    document.body.classList.remove("clip-dragging");
  });

  document.addEventListener(
    "toggle",
    (e) => {
      if (e.target instanceof HTMLDetailsElement && e.target.classList.contains("clip-settings-more")) {
        moreOpen = e.target.open;
      }
    },
    true
  );

  document.body.addEventListener("htmx:afterSwap", (e) => {
    if (e.detail.target?.id !== "settings-panel") return;
    const details = document.querySelector(".clip-settings-more");
    if (details instanceof HTMLDetailsElement && moreOpen) {
      details.open = true;
    }
    applySavedHeight();
  });
})();
