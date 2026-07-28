/** @jsxImportSource hono/jsx */
import {
  EXPIRES_OPTIONS,
  EXPIRES_CUSTOM,
  EXPIRES_BURN,
  remainingSeconds,
  expiresModeFromClip,
  formatExpiresAt,
} from "../../lib/constants";
import { SettingHint } from "./SettingHint";
import { VersionsPanel } from "./Versions";
import { CloseIcon } from "./ClipIcons";
import type { ClipVersion } from "../../db/schema";
import type { ClipFileMeta } from "../../store/clips";

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
  e2eSalt?: string | null;
  e2eWrappedKey?: string | null;
  e2eKdf?: string | null;
  visibility: "private" | "public";
  devices: number;
  versions: ClipVersion[];
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
    ["yaml", "YAML"],
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

function ExpiresSelect({
  slug,
  expiresAt,
  burnOnRead,
  visibility,
  id,
  showHint = false,
}: {
  slug: string;
  expiresAt: number | null;
  burnOnRead: boolean;
  visibility: "private" | "public";
  id: string;
  showHint?: boolean;
}) {
  const currentExpires = expiresModeFromClip(burnOnRead, expiresAt);
  const isPublic = visibility === "public";
  const expiresOptions = isPublic
    ? EXPIRES_OPTIONS.filter((opt) => opt.value !== EXPIRES_BURN)
    : EXPIRES_OPTIONS;

  return (
    <div class="field">
      <SettingsLabel forId={id}>
        <span>Expires</span>
      </SettingsLabel>
      {showHint && (
        <SettingHint
          text={
            isPublic
              ? "Public clips need a timed expiry. Turn Public off to use burn-after-read."
              : "Burn after read deletes on the first real visit (not link previews). API reads also count. Unread burn clips still expire after 7 days."
          }
        />
      )}
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

function ProtectSection({
  slug,
  hasPin,
  encrypted,
}: {
  slug: string;
  hasPin: boolean;
  encrypted: boolean;
}) {
  const mode = encrypted ? "passphrase" : hasPin ? "pin" : "none";

  return (
    <div class="sheet__section" data-protect-section>
      <h3 class="sheet__section-title">Protect</h3>
      <SettingHint text="Passphrase protects with true end-to-end encryption in your browser. Webklip never receives your passphrase. Not available on Klipwall. File uploads are disabled while encrypted." />
      <div class="protect-options" role="radiogroup" aria-label="Protection">
        <label class="protect-option">
          <input
            type="radio"
            name="protect"
            value="none"
            checked={mode === "none"}
            data-protect-option="none"
            data-has-pin={hasPin ? "true" : "false"}
            data-encrypted={encrypted ? "true" : "false"}
          />
          <span class="protect-option__label">None</span>
          <span class="protect-option__desc">Anyone with the link</span>
        </label>
        <label class="protect-option">
          <input
            type="radio"
            name="protect"
            value="passphrase"
            checked={mode === "passphrase" || mode === "pin"}
            data-protect-option="passphrase"
            data-has-pin={hasPin ? "true" : "false"}
            data-encrypted={encrypted ? "true" : "false"}
          />
          <span class="protect-option__label">Passphrase</span>
          <span class="protect-option__desc">E2E encrypt in browser</span>
        </label>
      </div>

      {hasPin && !encrypted && (
        <div class="protect-pin-fields" data-legacy-pin-notice>
          <p class="settings-pin-status">
            Legacy server PIN is active (content is not E2E encrypted). Choose Passphrase to upgrade.
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
  language,
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
  const protectionAttrs = {
    "data-has-pin": hasPin ? "true" : "false",
    "data-encrypted": encrypted ? "true" : "false",
    "data-burn-on-read": burnOnRead ? "true" : "false",
  };

  return (
    <div id="settings-root" class="header-settings">
      <div class="header-cluster" aria-label="Clip status">
        <span class="chip chip--live chip--devices">
          <span class="pulse" aria-hidden="true"></span>
          <span id="device-count-desktop">{deviceLabel}</span>
        </span>
        <span class="chip chip--live chip--devices-mobile">
          <span class="pulse" aria-hidden="true"></span>
          <span id="device-count">{deviceLabel}</span>
        </span>
        <button
          type="button"
          class={`chip chip--action ${isPublic ? "chip--public" : "chip--private"}`}
          data-open-sheet="settings"
          title="Open settings"
        >
          {isPublic ? "Public" : "Private"}
        </button>
        {encrypted ? (
          <button
            type="button"
            class="chip chip--action chip--secure"
            data-open-sheet="settings"
            title="Open settings"
          >
            E2E
          </button>
        ) : hasPin ? (
          <button
            type="button"
            class="chip chip--action chip--pin"
            data-open-sheet="settings"
            title="Open settings"
          >
            PIN
          </button>
        ) : (
          <button
            type="button"
            class="chip chip--action chip--open"
            data-open-sheet="settings"
            title="Open settings"
          >
            Unprotected
          </button>
        )}
        {burnOnRead ? (
          <span class="chip chip--expiry">Burn</span>
        ) : (
          expiresAt !== null && (
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
            class="btn btn--ghost btn--icon"
            data-close-sheet
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>
        <div class="sheet__body">
          <fieldset class="settings-form-mobile" id="settings-form-mobile">
            <div class="sheet__section">
              <h3 class="sheet__section-title">Share</h3>
              <SettingHint text="Private link for people you share with, or list on Klipwall for discovery. Public clears passphrase E2E, legacy PIN, and burn-after-read." />
              <div class="field">
                <span class="field__label">Klipwall</span>
                <div class="settings-e2e-row">
                  <label class="toggle">
                    {isPublic ? (
                      <input
                        type="checkbox"
                        checked
                        data-public-toggle
                        data-slug={slug}
                        data-has-owner-password={hasOwnerPassword ? "true" : "false"}
                        {...protectionAttrs}
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
                        {...protectionAttrs}
                      />
                    )}
                    <span class="toggle__track" aria-hidden="true"></span>
                    <span>{isPublic ? "Listed on Klipwall" : "Private link only"}</span>
                  </label>
                </div>
              </div>
            </div>

            {!isPublic && <ProtectSection slug={slug} hasPin={hasPin} encrypted={encrypted} />}

            <div class="sheet__section">
              <h3 class="sheet__section-title">Lifetime</h3>
              <ExpiresSelect
                slug={slug}
                expiresAt={expiresAt}
                burnOnRead={burnOnRead}
                visibility={visibility}
                id="m-ttl"
                showHint
              />
            </div>

            <div class="sheet__section">
              <h3 class="sheet__section-title">Editor</h3>
              <div class="field">
                <SettingsLabel forId="m-language">
                  <span>Syntax highlighting</span>
                </SettingsLabel>
                <SettingHint text="Syntax highlighting in the editor only. Does not change how content is stored." />
                <select
                  id="m-language"
                  name="language"
                  hx-post={`/${slug}/settings`}
                  hx-target="#settings-root"
                  hx-swap="outerHTML"
                  hx-trigger="change"
                >
                  <LanguageOptions language={language} />
                </select>
              </div>
            </div>
          </fieldset>

          <div class="sheet__section">
            <h3 class="sheet__section-title">Ownership</h3>
            <p class="field-hint">
              {hasOwnerPassword
                ? "Owner password is set. Use it to recover edit access on a new device."
                : "An owner password is set when you list the clip on Klipwall."}{" "}
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
            <h3 class="sheet__section-title">Advanced</h3>
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
              </button>{" "}
              and webhooks.
            </p>
          </div>

          <div class="sheet__section">
            <VersionsPanel slug={slug} versions={versions} />
          </div>

          <div class="sheet__section">
            <h3 class="sheet__section-title">Danger zone</h3>
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
