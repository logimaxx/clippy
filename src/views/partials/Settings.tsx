/** @jsxImportSource hono/jsx */
import {
  EXPIRES_OPTIONS,
  EXPIRES_CUSTOM,
  remainingSeconds,
  expiresModeFromClip,
  formatExpiresAt,
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
  hasOwnerPassword: boolean;
  webhookUrl: string | null;
  encrypted: boolean;
  visibility: "private" | "public";
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
  hasOwnerPassword,
  encrypted,
  visibility,
  idPrefix = "",
  mobile = false,
}: {
  slug: string;
  expiresAt: number | null;
  burnOnRead: boolean;
  language: string | null;
  hasPin: boolean;
  hasOwnerPassword: boolean;
  encrypted: boolean;
  visibility: "private" | "public";
  idPrefix?: string;
  mobile?: boolean;
}) {
  const currentExpires = expiresModeFromClip(burnOnRead, expiresAt);
  const ttlId = `${idPrefix}ttl`;
  const languageId = `${idPrefix}language`;
  const pinId = `${idPrefix}pin`;
  const isPublic = visibility === "public";

  return (
    <>
      <div class="field">
        <span class="field__label">
          {mobile ? "List on Explore" : "Public"}
          {!mobile && (
            <SettingHint text="Lists this clip on Explore. You will set an owner password so you can recover access later. Visitors cannot use burn, PIN, or E2E." />
          )}
        </span>
        <div class="settings-e2e-row">
          <label class="toggle">
            {isPublic ? (
              <input
                type="checkbox"
                checked
                data-public-toggle
                data-slug={slug}
                data-has-owner-password={hasOwnerPassword ? "true" : "false"}
                hx-post={`/${slug}/settings`}
                hx-vals='{"visibility":"private"}'
                hx-target="#settings-root"
                hx-swap="outerHTML"
                hx-trigger="change"
              />
            ) : (
              <input
                type="checkbox"
                data-public-toggle
                data-slug={slug}
                data-has-owner-password={hasOwnerPassword ? "true" : "false"}
              />
            )}
            <span class="toggle__track" aria-hidden="true"></span>
            <span>
              {mobile
                ? "Show this clip on Explore"
                : isPublic
                  ? "On"
                  : "Off"}
            </span>
          </label>
        </div>
      </div>

      <div class="field">
        <SettingsLabel forId={ttlId}>
          <span>Expires</span>
          {!mobile && (
            <SettingHint
              text={
                isPublic
                  ? "Burn after read isn’t allowed for public clips — choosing it removes the clip from Explore."
                  : "Burn after read deletes on the first real visit (not link previews). API reads also count."
              }
            />
          )}
        </SettingsLabel>
        <select
          id={ttlId}
          name="ttl"
          data-expires-select
          data-slug={slug}
          data-expires-at={expiresAt ?? ""}
          hx-post={`/${slug}/settings`}
          hx-target="#settings-root"
          hx-swap="outerHTML"
          hx-trigger="change"
        >
          {EXPIRES_OPTIONS.map((opt) => {
            const selected = String(opt.value) === currentExpires;
            const label =
              opt.value === EXPIRES_CUSTOM && currentExpires === EXPIRES_CUSTOM && expiresAt
                ? `Custom · ${formatExpiresAt(expiresAt)}`
                : opt.label;
            return (
              <option value={opt.value} selected={selected}>
                {label}
              </option>
            );
          })}
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
          <SettingHint text="Encrypts in your browser before upload — the server only stores ciphertext. The key stays in the URL fragment (#key=…) and never reaches us. Share the full link (including #key=) so others can decrypt." />
        </span>
        <div class="settings-e2e-row">
          <label class="toggle">
            <input
              type="checkbox"
              checked={encrypted}
              hx-post={`/${slug}/settings`}
              hx-vals={encrypted ? '{"encrypted":"off"}' : '{"encrypted":"on"}'}
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
              Get Key
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
  hasOwnerPassword,
  webhookUrl,
  encrypted,
  visibility,
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
                hasOwnerPassword={hasOwnerPassword}
                encrypted={encrypted}
                visibility={visibility}
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
          {visibility === "public" && <span class="chip chip--public">Public</span>}
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
                hasOwnerPassword={hasOwnerPassword}
                encrypted={encrypted}
                visibility={visibility}
                idPrefix="m-"
                mobile
              />
            </div>
          </fieldset>
          <div class="sheet__section">
            <h3 class="sheet__section-title">Ownership</h3>
            <p class="field-hint">
              {hasOwnerPassword
                ? "Owner password is set. Use it to recover edit access on a new device."
                : "An owner password is set when you list the clip on Explore."}{" "}
              <a href={`/${slug}/claim`}>Recover ownership</a>
            </p>
            {hasOwnerPassword && visibility !== "public" && (
              <button
                type="button"
                class="btn btn--ghost btn--sm"
                hx-post={`/${slug}/settings`}
                hx-vals='{"clearOwnerPassword":"on"}'
                hx-target="#settings-root"
                hx-swap="outerHTML"
              >
                Remove owner password
              </button>
            )}
          </div>
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

      <div
        id="public-publish-modal"
        class="confirm-modal"
        hidden
        data-public-modal
        data-slug={slug}
        data-has-owner-password={hasOwnerPassword ? "true" : "false"}
      >
        <div class="confirm-modal__backdrop" data-public-modal-cancel></div>
        <div
          class="confirm-modal__panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="public-publish-title"
        >
          <h2 class="confirm-modal__title" id="public-publish-title">
            List on Explore
          </h2>
          <p class="confirm-modal__body">
            {hasOwnerPassword
              ? "Confirm your owner password to publish this clip. Cancel leaves Public off."
              : "Choose an owner password (min 8 characters) so you can recover edit access later. Cancel leaves Public off."}
          </p>
          <label class="field__label" for="public-owner-password">
            Owner password
          </label>
          <input
            type="password"
            id="public-owner-password"
            class="slug-input confirm-modal__input"
            autocomplete="new-password"
            minlength={8}
            maxlength={128}
            placeholder={hasOwnerPassword ? "Owner password" : "Min 8 characters"}
          />
          <p class="pin-error confirm-modal__error" id="public-owner-error" hidden></p>
          <div class="confirm-modal__actions">
            <button type="button" class="btn btn--ghost" data-public-modal-cancel>
              Cancel
            </button>
            <button type="button" class="btn btn--primary" data-public-modal-confirm>
              Publish
            </button>
          </div>
        </div>
      </div>

      <div
        id="custom-expires-modal"
        class="confirm-modal"
        hidden
        data-expires-modal
        data-slug={slug}
        data-expires-at={expiresAt ?? ""}
      >
        <div class="confirm-modal__backdrop" data-expires-modal-cancel></div>
        <div
          class="confirm-modal__panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="custom-expires-title"
        >
          <h2 class="confirm-modal__title" id="custom-expires-title">
            Custom expiry
          </h2>
          <p class="confirm-modal__body">
            Choose when this clip should be deleted. Maximum is 1 year from now.
          </p>
          <label class="field__label" for="custom-expires-at">
            Expires at
          </label>
          <input
            type="datetime-local"
            id="custom-expires-at"
            class="slug-input confirm-modal__input"
          />
          <p class="pin-error confirm-modal__error" id="custom-expires-error" hidden></p>
          <div class="confirm-modal__actions">
            <button type="button" class="btn btn--ghost" data-expires-modal-cancel>
              Cancel
            </button>
            <button type="button" class="btn btn--primary" data-expires-modal-confirm>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function filesPanelMeta(files: ClipFileMeta[]) {
  return formatFilesMeta(files);
}
