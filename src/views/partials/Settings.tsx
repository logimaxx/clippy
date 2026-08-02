/** @jsxImportSource hono/jsx */
import {
  EXPIRES_OPTIONS,
  EXPIRES_CUSTOM,
  EXPIRES_BURN,
  remainingSeconds,
  expiresModeFromClip,
  formatExpiresAt,
} from "../../lib/constants";
import { SectionTitle } from "./SettingHint";
import { VersionsPanel } from "./Versions";
import {
  BurnIcon,
  CloseIcon,
  DevicesIcon,
  EyeIcon,
  EyeOffIcon,
  KeyIcon,
  ShieldIcon,
} from "./ClipIcons";
import type { ClipVersion } from "../../db/schema";
import type { ClipFileMeta } from "../../store/clips";

interface SettingsProps {
  slug: string;
  expiresAt: number | null;
  burnOnRead: boolean;
  maxViews: number | null;
  hasPin: boolean;
  hasOwnerPassword: boolean;
  webhookUrl: string | null;
  encrypted: boolean;
  e2eSalt?: string | null;
  e2eWrappedKey?: string | null;
  e2eKdf?: string | null;
  visibility: "private" | "public";
  devices: number;
  versions: ClipVersion[];
}

function ExpiresSelect({
  slug,
  expiresAt,
  burnOnRead,
  visibility,
  id,
}: {
  slug: string;
  expiresAt: number | null;
  burnOnRead: boolean;
  visibility: "private" | "public";
  id: string;
}) {
  const currentExpires = expiresModeFromClip(burnOnRead, expiresAt);
  const isPublic = visibility === "public";
  const expiresOptions = isPublic
    ? EXPIRES_OPTIONS.filter((opt) => opt.value !== EXPIRES_BURN)
    : EXPIRES_OPTIONS;

  return (
    <div class="field">
      <select
        id={id}
        name="ttl"
        data-expires-select
        data-slug={slug}
        data-expires-at={expiresAt ?? ""}
        hx-post={`/${slug}/settings`}
        hx-target="#settings-root"
        hx-swap="outerHTML"
        hx-trigger="change"
        aria-label="Expires"
      >
        {expiresOptions.map((opt) => {
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
  );
}

function accessMode(
  visibility: "private" | "public",
  encrypted: boolean,
  hasPin: boolean
): "private" | "protected" | "published" {
  if (visibility === "public") return "published";
  if (encrypted || hasPin) return "protected";
  return "private";
}

function AccessSection({
  slug,
  hasPin,
  encrypted,
  visibility,
  hasOwnerPassword,
  burnOnRead,
}: {
  slug: string;
  hasPin: boolean;
  encrypted: boolean;
  visibility: "private" | "public";
  hasOwnerPassword: boolean;
  burnOnRead: boolean;
}) {
  const mode = accessMode(visibility, encrypted, hasPin);
  const accessAttrs = {
    "data-slug": slug,
    "data-visibility": visibility,
    "data-has-pin": hasPin ? "true" : "false",
    "data-encrypted": encrypted ? "true" : "false",
    "data-burn-on-read": burnOnRead ? "true" : "false",
    "data-has-owner-password": hasOwnerPassword ? "true" : "false",
  };

  return (
    <div class="sheet__section" data-access-section>
      <SectionTitle
        title="Access"
        help="Private: anyone with the link can edit. Protected: passphrase end-to-end encryption in your browser — Webklip never sees the passphrase; file uploads are disabled. Published: listed on Klipwall for discovery; clears protection and burn-after-read, and requires an owner password."
      />
      <div class="protect-options" role="radiogroup" aria-label="Access">
        <label class="protect-option">
          <input
            type="radio"
            name="access"
            value="private"
            checked={mode === "private"}
            data-access-option="private"
            {...accessAttrs}
          />
          <span class="protect-option__label">Private</span>
          <span class="protect-option__desc">Link only</span>
        </label>
        <label class="protect-option">
          <input
            type="radio"
            name="access"
            value="protected"
            checked={mode === "protected"}
            data-access-option="protected"
            {...accessAttrs}
          />
          <span class="protect-option__label">Protected</span>
          <span class="protect-option__desc">Passphrase E2E</span>
        </label>
        <label class="protect-option">
          <input
            type="radio"
            name="access"
            value="published"
            checked={mode === "published"}
            data-access-option="published"
            {...accessAttrs}
          />
          <span class="protect-option__label">Published</span>
          <span class="protect-option__desc">On Klipwall</span>
        </label>
      </div>

      {hasPin && !encrypted && (
        <div class="protect-pin-fields" data-legacy-pin-notice>
          <p class="settings-pin-status">
            Legacy server PIN is active (content is not E2E encrypted). Choose Protected to upgrade.
          </p>
          <button
            type="button"
            class="btn btn--ghost btn--sm"
            hx-post={`/${slug}/settings`}
            hx-vals='{"protect":"none"}'
            hx-target="#settings-root"
            hx-swap="outerHTML"
          >
            Remove legacy PIN
          </button>
        </div>
      )}

      {encrypted && (
        <div class="settings-e2e-row protect-e2e-actions" data-e2e-active>
          <p class="settings-pin-status">
            End-to-end encryption is active. Share the link and passphrase separately.
          </p>
          <div class="settings-pin-actions">
            <button
              type="button"
              class="btn btn--ghost btn--sm"
              data-e2e-copy-passphrase
              title="Copy passphrase from this browser session"
            >
              Copy passphrase
            </button>
            <button
              type="button"
              class="btn btn--ghost btn--sm"
              data-e2e-change-passphrase
            >
              Change passphrase
            </button>
            <button
              type="button"
              class="btn btn--ghost btn--sm settings-pin-remove"
              data-e2e-remove-protect
            >
              Remove protection
            </button>
          </div>
        </div>
      )}

      {hasOwnerPassword && visibility !== "public" && (
        <div class="access-owner-meta">
          <p class="field-hint">
            Owner password is set for recovery.{" "}
            <a href={`/${slug}/claim`}>Recover ownership</a>
          </p>
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
        </div>
      )}

      {hasOwnerPassword && visibility === "public" && (
        <p class="field-hint access-owner-meta">
          Owner password is set.{" "}
          <a href={`/${slug}/claim`}>Recover ownership</a>
        </p>
      )}
    </div>
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
  hasPin,
  hasOwnerPassword,
  webhookUrl,
  encrypted,
  visibility,
  devices,
  versions,
}: SettingsProps) {
  const deviceLabel = `${devices} device${devices === 1 ? "" : "s"}`;
  const isPublic = visibility === "public";
  const mode = accessMode(visibility, encrypted, hasPin);
  const accessLabel =
    mode === "published"
      ? "Published"
      : mode === "protected"
        ? encrypted
          ? "Protected"
          : "PIN protected"
        : "Private";
  const accessChipClass =
    mode === "published"
      ? "chip--public"
      : mode === "protected"
        ? encrypted
          ? "chip--secure"
          : "chip--pin"
        : "chip--private";

  return (
    <div id="settings-root" class="header-settings">
      <div class="header-cluster" aria-label="Clip status">
        <span
          class="chip chip--icon chip--live chip--devices"
          aria-label={deviceLabel}
          title={deviceLabel}
        >
          <span class="pulse" aria-hidden="true"></span>
          <DevicesIcon />
          <span id="device-count">{devices}</span>
        </span>
        <button
          type="button"
          class={`chip chip--icon chip--action ${accessChipClass}`}
          data-open-sheet="settings"
          aria-label={accessLabel}
          title={accessLabel}
        >
          {mode === "published" ? (
            <EyeIcon />
          ) : mode === "protected" ? (
            encrypted ? (
              <ShieldIcon />
            ) : (
              <KeyIcon />
            )
          ) : (
            <EyeOffIcon />
          )}
        </button>
        {burnOnRead ? (
          <span class="chip chip--icon chip--expiry" aria-label="Burn on read" title="Burn on read">
            <BurnIcon />
          </span>
        ) : (
          expiresAt !== null && (
            <button
              type="button"
              id="ttl-countdown"
              class="countdown countdown--chip chip--action"
              data-open-sheet="settings"
              data-expires={expiresAt}
              hx-get={`/${slug}/countdown`}
              hx-trigger="every 1s"
              hx-swap="innerHTML"
              aria-label="Time remaining"
              title="Open settings"
            >
              {remainingSeconds(expiresAt)}s
            </button>
          )
        )}
      </div>

      <div class="header-quick">
        <fieldset class="settings-form-desktop" id="settings-form-desktop">
          <ExpiresSelect
            slug={slug}
            expiresAt={expiresAt}
            burnOnRead={burnOnRead}
            visibility={visibility}
            id="ttl"
          />
        </fieldset>
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
            class="btn btn--ghost btn--icon sheet__close"
            data-close-sheet
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>
        <div class="sheet__body">
          <fieldset class="settings-form-mobile" id="settings-form-mobile">
            <div class="sheet__section">
              <SectionTitle
                title="Expires"
                help={
                  isPublic
                    ? "Published clips need a timed expiry. Switch to Private to use burn-after-read."
                    : "Burn after read deletes on the first real visit (not link previews). API reads also count. Unread burn clips still expire after 7 days."
                }
              />
              <ExpiresSelect
                slug={slug}
                expiresAt={expiresAt}
                burnOnRead={burnOnRead}
                visibility={visibility}
                id="m-ttl"
              />
            </div>

            <AccessSection
              slug={slug}
              hasPin={hasPin}
              encrypted={encrypted}
              visibility={visibility}
              hasOwnerPassword={hasOwnerPassword}
              burnOnRead={burnOnRead}
            />
          </fieldset>

          <div class="sheet__section">
            <VersionsPanel slug={slug} versions={versions} />
          </div>

          <div class="sheet__section">
            <SectionTitle
              title="Appearance"
              help="Light or dark for this browser only. Does not change how others see the clip."
            />
            <div class="field">
              <span class="field__label">Theme</span>
              <div class="settings-e2e-row">
                <label class="toggle">
                  <input type="checkbox" data-theme-toggle />
                  <span class="toggle__track" aria-hidden="true"></span>
                  <span data-theme-toggle-label>Light</span>
                </label>
              </div>
            </div>
          </div>

          <div class="sheet__section">
            <SectionTitle
              title="Advanced"
              help="Optional webhook notified when the clip changes. Use the REST API to automate create and update."
            />
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
            <p class="settings-api-hint">
              Automate clips with the{" "}
              <button
                type="button"
                class="link-btn"
                data-open-docs-modal
                data-docs-path="/docs/api"
              >
                REST API
              </button>
              .
            </p>
          </div>

          <div class="sheet__section">
            <h3 class="sheet__section-title">Delete clip</h3>
            <div class="danger-zone">
              <p>Permanently delete this clip, files, and version history.</p>
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
        id="e2e-passphrase-setup-modal"
        class="confirm-modal"
        hidden
        data-e2e-setup-modal
        data-slug={slug}
      >
        <div class="confirm-modal__backdrop" data-e2e-setup-cancel></div>
        <div
          class="confirm-modal__panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="e2e-setup-title"
        >
          <h2 class="confirm-modal__title" id="e2e-setup-title">
            Set passphrase
          </h2>
          <p class="confirm-modal__body">
            We generated a memorable phrase. You can change it. Your passphrase never leaves this
            browser — Webklip cannot decrypt your clip.
          </p>
          <label class="field__label" for="e2e-setup-passphrase">
            Passphrase
          </label>
          <div class="settings-pin-row">
            <input
              type="text"
              id="e2e-setup-passphrase"
              class="slug-input confirm-modal__input"
              autocomplete="off"
              spellcheck={false}
              data-e2e-setup-passphrase
            />
            <button type="button" class="btn btn--ghost btn--sm" data-e2e-setup-regenerate>
              New phrase
            </button>
          </div>
          <p class="pin-warning" data-e2e-setup-weak hidden>
            Short or simple secrets can be cracked offline if someone gets the ciphertext. Continue
            only if you accept that risk.
          </p>
          <label class="toggle" data-e2e-setup-weak-ack hidden>
            <input type="checkbox" data-e2e-setup-ack />
            <span>I understand the risk of a short passphrase</span>
          </label>
          <p class="pin-error" data-e2e-setup-error hidden></p>
          <div class="confirm-modal__actions">
            <button type="button" class="btn btn--ghost" data-e2e-setup-cancel>
              Cancel
            </button>
            <button type="button" class="btn btn--primary" data-e2e-setup-confirm>
              Enable E2E
            </button>
          </div>
        </div>
      </div>

      <div
        id="public-clear-protections-modal"
        class="confirm-modal"
        hidden
        data-public-clear-modal
        data-slug={slug}
        data-has-owner-password={hasOwnerPassword ? "true" : "false"}
      >
        <div class="confirm-modal__backdrop" data-public-clear-modal-cancel></div>
        <div
          class="confirm-modal__panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="public-clear-protections-title"
        >
          <h2 class="confirm-modal__title" id="public-clear-protections-title">
            Clear protections to publish?
          </h2>
          <p class="confirm-modal__body" data-public-clear-modal-body>
            Publishing on Klipwall clears passphrase E2E, legacy PIN, and burn-after-read.
          </p>
          <div class="confirm-modal__actions">
            <button type="button" class="btn btn--ghost" data-public-clear-modal-cancel>
              Cancel
            </button>
            <button type="button" class="btn btn--primary" data-public-clear-modal-confirm>
              Continue
            </button>
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
            List on Klipwall
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
