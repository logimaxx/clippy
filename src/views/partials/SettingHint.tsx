/** @jsxImportSource hono/jsx */

/** Section title with click-to-toggle help tooltip. */
export function SectionTitle({
  title,
  help,
  as: Tag = "h3",
}: {
  title: string;
  help: string;
  as?: "h3" | "h2";
}) {
  return (
    <div class="sheet__section-title-row">
      <Tag class="sheet__section-title">{title}</Tag>
      <span class="section-help">
        <button
          type="button"
          class="section-help__btn"
          data-section-help
          aria-label={`About ${title}`}
          aria-expanded="false"
          title="Help"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </button>
        <span class="section-help__tip" role="tooltip" hidden>
          {help}
        </span>
      </span>
    </div>
  );
}
