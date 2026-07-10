/** @jsxImportSource hono/jsx */
import {
  EXPIRES_OPTIONS,
  remainingSeconds,
  expiresModeFromClip,
} from "../../lib/constants";
import { SettingHint } from "./SettingHint";
import { VersionsPanel } from "./Versions";
import { CloseIcon } from "./ClipIcons";
import type { ClipVersion } from "../../db/schema";
import type { ClipFileMeta } from "../../store/clips";
import { FileAttachment } from "./FileAttachment";

interface SettingsProps {
  slug: string;
  expiresAt: number | null;
  burnOnRead: boolean;
  language: string | null;
  maxViews: number | null;
  hasPin: boolean;
  webhookUrl: string | null;
  encrypted: boolean;
  devices: number;
  versions: ClipVersion[];
  files?: ClipFileMeta[];
}

function SettingsLabel({
  forId,
  children,
  class: className = "field__label",
}: {
  forId?: string;
  children: unknown;
  class?: string;
}) {
  return (
    <label for={forId} class={className}>
      {children}
    </label>
  );
}

function LanguageOptions({ language }: { language: string | null }) {
  const langs = [
    ["", "Plain text"],
    ["javascript", "JavaScript"],
    ["typescript", "TypeScript"],
    ["python", "Python"],
    ["bash", "Bash"],
    ["json", "JSON"],
    ["html", "HTML"],
    ["css", "CSS"],
    ["sql", "SQL"],
    ["markdown", "Markdown"],
  ] as const;

  return (
    <>
      {langs.map(([value, label]) => (
        <option value={value} selected={language === value || (!language && value === "")}>
          {label}
        </option>
      ))}
    </>
  );
}

function SettingsPrimaryFields({
  slug,
  expiresAt,
  burnOnRead,
  language,
  hasPin,
  encrypted,
  idPrefix = "",
  mobile = false,
}: {
  slug: string;
  expiresAt: number | null;
  burnOnRead: boolean;
  language: string | null;
  hasPin: boolean;
  encrypted: boolean;
  idPrefix?: string;
  mobile?: boolean;
}) {
  const currentExpires = expiresModeFromClip(burnOnRead, expiresAt);
  const ttlId = `${idPrefix}ttl`;
  const languageId = `${idPrefix}language`;
  const pinId = `${idPrefix}pin`;

  return (
    <>
      <div class="field">
        <SettingsLabel forId={ttlId}>
          <span>Expires</span>
          {!mobile && (
            <SettingHint text="Burn after read deletes on the first real visit (not link previews). API reads also count." />
          )}
        </SettingsLabel>
        <select
          id={ttlId}
          name="ttl"
          hx-post={`/${slug}/settings`}
          hx-target="#settings-root"
          hx-swap="outerHTML"
          hx-trigger="change"
        >
          {EXPIRES_OPTIONS.map((opt) => (
            <option value={opt.value} selected={String(opt.value) === currentExpires}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div class="field">
        <SettingsLabel forId={languageId}>
          <span>{mobile ? "Syntax highlighting" : "Syntax"}</span>
          {!mobile && (
            <SettingHint text="Syntax highlighting in the editor only. Does not change how content is stored." />
          )}
        </SettingsLabel>
        <select
          id={languageId}
          name="language"
          hx-post={`/${slug}/settings`}
          hx-target="#settings-root"
          hx-swap="outerHTML"
          hx-trigger="change"
        >
          <LanguageOptions language={language} />
        </select>
      </div>

      <div class={`field${mobile ? "" : " field--pin"}`}>
        <SettingsLabel forId={hasPin ? undefined : pinId}>
          <span>{mobile ? "PIN protection" : "PIN"}</span>
          {hasPin && !mobile && <span class="settings-pin-badge">on</span>}
          {!mobile && (
            <SettingHint text="Visitors must enter this PIN before they can open the clip." />
          )}
        </SettingsLabel>
        {hasPin ? (
          <div class="settings-pin-active">
            <p class="settings-pin-status">PIN protection is active</p>
            <div class="settings-pin-actions">
              <button
                type="button"
                class="btn btn--ghost btn--sm settings-pin-remove"
                hx-post={`/${slug}/settings`}
                hx-vals='{"clearPin":"on"}'
                hx-target="#settings-root"
                hx-swap="outerHTML"
              >
                Remove PIN
              </button>
              <details class="settings-pin-change">
                <summary class="settings-pin-change-trigger">Change PIN</summary>
                <div class="settings-pin-row">
                  <input
                    type="password"
                    id={pinId}
                    name="pin"
                    placeholder="New PIN"
                    autocomplete="new-password"
                  />
                  <button
                    type="button"
                    class="btn btn--ghost btn--sm settings-pin-save"
                    hx-post={`/${slug}/settings`}
                    hx-include={`[name='pin']`}
                    hx-target="#settings-root"
                    hx-swap="outerHTML"
                  >
                    Save
                  </button>
                </div>
              </details>
            </div>
          </div>
        ) : (
          <div class="settings-pin-row">
            <input
              type="password"
              id={pinId}
              name="pin"
              placeholder="Set PIN"
              autocomplete="new-password"
            />
            <button
              type="button"
              class="btn btn--ghost btn--sm settings-pin-save"
              hx-post={`/${slug}/settings`}
              hx-include={`[name='pin']`}
              hx-target="#settings-root"
              hx-swap="outerHTML"
            >
              Save
            </button>
          </div>
        )}
      </div>

      <div class="field">
        <span class="field__label">
          {mobile ? "End-to-end encryption" : "E2E encryption"}
        </span>
        <div class="settings-e2e-row">
          <label class="toggle">
            <input type="hidden" name="encrypted" value="off" />
            <input
              type="checkbox"
              name="encrypted"
              value="on"
              checked={encrypted}
              hx-post={`/${slug}/settings`}
              hx-target="#settings-root"
              hx-swap="outerHTML"
              hx-trigger="change"
            />
            <span class="toggle__track" aria-hidden="true"></span>
            <span>
              {mobile
                ? "Encrypt in browser (key in URL hash)"
                : encrypted
                  ? "On"
                  : "Off"}
            </span>
          </label>
          {encrypted && !mobile && (
            <button
              type="button"
              class="btn btn--ghost btn--sm"
              id="e2e-generate-key"
              title="Generate & copy secure link"
            >
              Key
            </button>
          )}
        </div>
      </div>

      {!burnOnRead && expiresAt !== null && !mobile && (
        <div class="field">
          <span class="field__label">
            <span>Countdown</span>
            <SettingHint text="Time left before this clip is deleted." />
          </span>
          <span
            id="ttl-countdown"
            class="countdown"
            data-expires={expiresAt}
            hx-get={`/${slug}/countdown`}
            hx-trigger="every 1s"
            hx-swap="innerHTML"
          >
            {remainingSeconds(expiresAt)}s
          </span>
        </div>
      )}
    </>
  );
}

function formatFilesMeta(files: ClipFileMeta[]) {
  if (files.length === 0) return "0 files";
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const kb = Math.max(1, Math.round(totalBytes / 1024));
  return `${files.length} file${files.length === 1 ? "" : "s"} · ${kb} KB`;
}

export function SettingsPanel({
  slug,
  expiresAt,
  burnOnRead,
  language,
  hasPin,
  webhookUrl,
  encrypted,
  devices,
  versions,
  files = [],
}: SettingsProps) {
  const deviceLabel = `${devices} device${devices === 1 ? "" : "s"}`;

  return (
    <div id="settings-root">
      <div id="settings-panel">
        <div class="toolbar toolbar--desktop-only" role="toolbar" aria-label="Clip settings">
          <div class="toolbar__group">
            <fieldset class="settings-form-desktop" id="settings-form-desktop">
              <SettingsPrimaryFields
                slug={slug}
                expiresAt={expiresAt}
                burnOnRead={burnOnRead}
                language={language}
                hasPin={hasPin}
                encrypted={encrypted}
              />
            </fieldset>
          </div>
          <button
            type="button"
            class="btn btn--ghost btn--sm toolbar__more"
            data-open-sheet="settings"
          >
            More
          </button>
        </div>

        <div class="toolbar toolbar--mobile-only">
          <span class="chip chip--live">
            <span class="pulse" aria-hidden="true"></span>
            Synced · <span id="device-count">{deviceLabel}</span>
          </span>
          {encrypted && <span class="chip chip--secure">E2E on</span>}
          {!burnOnRead && expiresAt !== null && (
            <span
              class="countdown"
              style="margin-left:auto"
              data-expires={expiresAt}
              hx-get={`/${slug}/countdown`}
              hx-trigger="every 1s"
              hx-swap="innerHTML"
            >
              {remainingSeconds(expiresAt)}s
            </span>
          )}
        </div>
      </div>

      <div class="sheet-backdrop" id="sheet-backdrop" hidden data-sheet-backdrop></div>

      <div
        class="sheet"
        id="sheet-settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-settings-title"
        hidden
        data-sheet="settings"
      >
        <div class="sheet__handle" aria-hidden="true"></div>
        <div class="sheet__header">
          <h2 class="sheet__title" id="sheet-settings-title">
            Settings
          </h2>
          <button
            type="button"
            class="btn btn--ghost btn--icon"
            data-close-sheet
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>
        <div class="sheet__body">
          <fieldset class="settings-form-mobile" id="settings-form-mobile">
            <div class="settings-grid">
              <SettingsPrimaryFields
                slug={slug}
                expiresAt={expiresAt}
                burnOnRead={burnOnRead}
                language={language}
                hasPin={hasPin}
                encrypted={encrypted}
                idPrefix="m-"
                mobile
              />
            </div>
          </fieldset>
          <div class="sheet__section">
            <h3 class="sheet__section-title">Integrations</h3>
            <div class="field">
              <label class="field__label" for="m-webhook">
                Webhook URL
              </label>
              <input
                type="url"
                id="m-webhook"
                name="webhook"
                value={webhookUrl ?? ""}
                placeholder="https://example.com/hook"
              />
            </div>
          </div>
          <div class="sheet__section">
            <VersionsPanel slug={slug} versions={versions} />
          </div>
          <div class="sheet__section">
            <h3 class="sheet__section-title">Danger zone</h3>
            <div class="danger-zone">
              <p>
                Permanently delete this clip, files, and version history.
              </p>
              <button
                id="delete-clip-btn"
                type="button"
                class="btn btn--danger btn--sm"
                hx-delete={`/${slug}`}
                hx-confirm="Delete this clip permanently? This cannot be undone."
              >
                Delete clip
              </button>
            </div>
          </div>
        </div>
      </div>

      <div
        class="sheet"
        id="sheet-files"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-files-title"
        hidden
        data-sheet="files"
      >
        <div class="sheet__handle" aria-hidden="true"></div>
        <div class="sheet__header">
          <h2 class="sheet__title" id="sheet-files-title">
            Files
          </h2>
          <button
            type="button"
            class="btn btn--ghost btn--icon"
            data-close-sheet
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>
        <div class="sheet__body">
          <form class="upload-form" data-upload-url={`/${slug}/upload`}>
            <label class="drop-zone">
              Tap to attach files
              <input
                type="file"
                name="file"
                class="file-input"
                accept="image/*,.pdf,.txt,.zip,.json,.md"
                multiple
              />
            </label>
          </form>
          <div class="file-list" style="padding:0">
            {files.length > 0 ? (
              files.map((file) => (
                <FileAttachment
                  key={file.fileId}
                  slug={slug}
                  fileId={file.fileId}
                  filename={file.filename}
                  mimeType={file.mimeType}
                  size={file.size}
                  compact
                />
              ))
            ) : (
              <div class="empty-state">No files attached yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function filesPanelMeta(files: ClipFileMeta[]) {
  return formatFilesMeta(files);
}
