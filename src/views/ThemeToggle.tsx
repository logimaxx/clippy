/** @jsxImportSource hono/jsx */
export { THEME_INIT_SCRIPT } from "../lib/theme-init";

export function ThemeToggle({ floating = false }: { floating?: boolean } = {}) {
  return (
    <button
      type="button"
      class={floating ? "theme-toggle theme-toggle--floating" : "theme-toggle"}
      id="theme-toggle"
      aria-label="Switch to dark theme"
    >
      <svg class="theme-toggle-icon theme-toggle-icon--sun" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
      <svg class="theme-toggle-icon theme-toggle-icon--moon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    </button>
  );
}
