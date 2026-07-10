/** @jsxImportSource hono/jsx */

export function SettingHint({ text }: { text: string }) {
  return (
    <span class="setting-hint" tabindex="0">
      <span class="setting-hint-icon" aria-hidden="true">
        i
      </span>
      <span class="setting-hint-tooltip" role="tooltip">
        {text}
      </span>
    </span>
  );
}
