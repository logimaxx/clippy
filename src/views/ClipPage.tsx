/** @jsxImportSource hono/jsx */
import { Layout } from "./Layout";
import { ThemeToggle } from "./ThemeToggle";
import { SettingsPanel, filesPanelMeta } from "./partials/Settings";
import { FileAttachment } from "./partials/FileAttachment";
import {
  ShareIcon,
  CopyIcon,
  CloneIcon,
  QrIcon,
  NativeShareIcon,
  EditorNavIcon,
  FilesNavIcon,
  SettingsNavIcon,
  CloseIcon,
} from "./partials/ClipIcons";
import { asset } from "../lib/assets";
import { siteHost } from "../lib/constants";
import { clipSeoMeta } from "../lib/clip-seo";
import type { Clip, ClipVersion } from "../db/schema";
import { getClipFiles } from "../store/clips";

interface ClipPageProps {
  slug: string;
  content: string;
  expiresAt: number | null;
  burnOnRead: boolean;
  language: string | null;
  maxViews: number | null;
  hasPin: boolean;
  hasOwnerPassword?: boolean;
  isOwner?: boolean;
  webhookUrl: string | null;
  devices: number;
  clip: Clip;
  versions: ClipVersion[];
  encrypted: boolean;
  visibility: "private" | "public";
  readOnly?: boolean;
  burned?: boolean;
  cloneError?: string | null;
  cloneSlugValue?: string;
}

export function ClipPage({
  slug,
  content,
  expiresAt,
  burnOnRead,
  language,
  maxViews,
  hasPin,
  hasOwnerPassword = false,
  isOwner = false,
  webhookUrl,
  devices,
  clip,
  versions,
  encrypted,
  visibility,
  readOnly = false,
  burned = false,
  cloneError = null,
  cloneSlugValue = "",
}: ClipPageProps) {
  const files = getClipFiles(clip);
  const deviceLabel = `${devices} device${devices === 1 ? "" : "s"}`;
  const isPublic = visibility === "public";
  const host = siteHost();
  const clipPathLabel = `${host}/${slug}`;
  const seo = isPublic ? clipSeoMeta(slug, content) : null;
  const showCloneModal = Boolean(cloneError);

  return (
    <Layout
      title={seo?.title ?? `Webklip — ${slug}`}
      description={seo?.description}
      ogTitle={seo?.ogTitle}
      ogDescription={seo?.ogDescription}
      themeToggle="none"
      robots={isPublic ? undefined : "noindex, nofollow"}
    >
      <div class="app" data-view="editor">
        <header class="header header--clip">
          <a href="/" class="logo logo--icon" aria-label="Webklip home">
            <span class="logo-mark" aria-hidden="true">
              W
            </span>
          </a>

          {readOnly ? (
            <div class="header-cluster" aria-label="Clip status">
              <span class="chip chip--live chip--devices">
                <span class="pulse" aria-hidden="true"></span>
                <span id="device-count-desktop">{deviceLabel}</span>
              </span>
              <span class={`chip ${isPublic ? "chip--public" : "chip--private"}`}>
                {isPublic ? "Public" : "Private"}
              </span>
              {hasPin ? (
                <span class="chip chip--pin">PIN</span>
              ) : encrypted ? (
                <span class="chip chip--secure">E2E</span>
              ) : (
                <span class="chip chip--open">Unprotected</span>
              )}
              {!isOwner && hasOwnerPassword && (
                <a href={`/${slug}/claim`} class="chip chip--owner-claim">
                  Recover ownership
                </a>
              )}
            </div>
          ) : (
            <SettingsPanel
              slug={slug}
              expiresAt={expiresAt}
              burnOnRead={burnOnRead}
              language={language}
              maxViews={maxViews}
              hasPin={hasPin}
              hasOwnerPassword={hasOwnerPassword}
              webhookUrl={webhookUrl}
              encrypted={encrypted}
              visibility={visibility}
              devices={devices}
              versions={versions}
              files={files}
            />
          )}

          <div class="header-actions">
            <ThemeToggle />
            <div class="share-menu" id="share-menu">
              <button
                type="button"
                class="btn btn--primary"
                id="share-trigger"
                aria-haspopup="menu"
                aria-expanded="false"
                aria-controls="share-popover"
              >
                <ShareIcon />
                Share
              </button>
              <div class="share-menu__popover" id="share-popover" role="menu" hidden>
                <button
                  type="button"
                  class="share-menu__item"
                  role="menuitem"
                  data-share-action="copy"
                  id="copy-link-btn"
                >
                  <CopyIcon />
                  Copy link
                </button>
                {isPublic && (
                  <button
                    type="button"
                    class="share-menu__item"
                    role="menuitem"
                    data-share-action="clone"
                    id="clone-clip-btn"
                  >
                    <CloneIcon />
                    Clone to edit
                  </button>
                )}
                <button
                  type="button"
                  class="share-menu__item"
                  role="menuitem"
                  data-share-action="qr"
                  data-qr-url={`/${slug}/qr`}
                >
                  <QrIcon />
                  Show QR code
                </button>
                <div class="share-menu__divider share-menu__divider--native" hidden></div>
                <button
                  type="button"
                  class="share-menu__item share-menu__item--native"
                  role="menuitem"
                  data-share-action="native"
                >
                  <NativeShareIcon />
                  Share via apps
                </button>
              </div>
            </div>
          </div>
        </header>

        <div class="workspace">
          {burned && (
            <div class="burn-banner" role="status">
              This clip was deleted after you opened it. Copy anything you need now.
            </div>
          )}
          {readOnly && !burned && isPublic && (
            <div class="burn-banner burn-banner--public" role="status">
              <span class="burn-banner__text">
                This public clip is view-only.
                {hasOwnerPassword ? (
                  <>
                    {" "}
                    <a href={`/${slug}/claim`}>Recover ownership</a> to edit, or
                    clone it to make your own copy.
                  </>
                ) : (
                  <> Clone it to make your own editable copy.</>
                )}
              </span>
              <button
                type="button"
                class="btn btn--primary btn--sm burn-banner__clone"
                id="clone-clip-banner-btn"
                data-open-clone-modal
              >
                Clone
              </button>
            </div>
          )}

          <div class="main-grid">
            <section class="editor-panel" aria-label="Clip content">
              <div class="panel-header">
                <h2 class="panel-title">Content</h2>
                <div class="panel-header__actions">
                  <button
                    type="button"
                    id="md-preview-toggle"
                    class="btn btn--ghost btn--sm"
                    hidden
                    aria-pressed="false"
                  >
                    Preview
                  </button>
                  <span class="panel-meta" id="char-count"></span>
                </div>
              </div>
              <div
                id="clip-editor-wrap"
                class="editor-wrap clip-editor-wrap"
                data-language={language ?? ""}
                data-encrypted={encrypted ? "true" : "false"}
              >
                <div id="clip-editor-mount" class="clip-editor-mount" hidden></div>
                <div
                  id="clip-md-preview"
                  class="clip-md-preview"
                  hidden
                  aria-label="Markdown preview"
                ></div>
                <textarea
                  id="clip-content"
                  name="content"
                  class="editor clip-editor"
                  placeholder="Paste or type anything…"
                  spellcheck={false}
                  aria-label="Clip content editor"
                  data-ws-room={readOnly ? undefined : slug}
                  data-ws-url={readOnly ? undefined : `/ws/${slug}`}
                  data-encrypted={encrypted ? "true" : "false"}
                  disabled={readOnly}
                  readonly={readOnly}
                >{content}</textarea>
              </div>
            </section>

            <aside class="files-panel" aria-label="Attached files">
              <div class="panel-header">
                <h2 class="panel-title">Files</h2>
                <span class="panel-meta" id="files-panel-meta">
                  {filesPanelMeta(files)}
                </span>
              </div>
              <div class="files-panel__body">
                {!readOnly && (
                  <form class="upload-form" data-upload-url={`/${slug}/upload`}>
                    <label class="drop-zone" id="drop-zone">
                      Drop files here or tap to browse
                      <input
                        type="file"
                        name="file"
                        class="file-input"
                        accept="image/*,.pdf,.txt,.zip,.json,.md"
                        multiple
                      />
                    </label>
                    <span id="upload-status" class="upload-status"></span>
                  </form>
                )}
                <div class="file-list" id="clip-files-list">
                  {files.length > 0 ? (
                    files.map((file) => (
                      <FileAttachment
                        key={file.fileId}
                        slug={slug}
                        fileId={file.fileId}
                        filename={file.filename}
                        mimeType={file.mimeType}
                        size={file.size}
                        readOnly={readOnly}
                      />
                    ))
                  ) : (
                    <div id="clip-files-empty" class="empty-state">
                      {readOnly ? "No files attached." : "No files attached yet."}
                    </div>
                  )}
                </div>
              </div>
            </aside>
          </div>
        </div>

        <nav class="bottom-nav" aria-label="Mobile navigation">
          <button type="button" class="bottom-nav__item is-active" data-view="editor">
            <EditorNavIcon />
            Editor
          </button>
          <button
            type="button"
            class="bottom-nav__item"
            data-view="files"
            data-open-sheet="files"
          >
            <FilesNavIcon />
            Files
          </button>
          {!readOnly && (
            <button type="button" class="bottom-nav__item" data-open-sheet="settings">
              <SettingsNavIcon />
              Settings
            </button>
          )}
        </nav>

        <div class="modal-backdrop" id="qr-modal-backdrop" hidden data-qr-modal>
          <div
            class="modal qr-modal"
            id="qr-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="qr-modal-title"
            hidden
          >
            <div class="modal__header">
              <h2 class="modal__title" id="qr-modal-title">
                Scan to open
              </h2>
              <button
                type="button"
                class="btn btn--ghost btn--icon"
                data-close-qr-modal
                aria-label="Close"
              >
                <CloseIcon />
              </button>
            </div>
            <div class="modal__body">
              <div class="qr-box">
                <img
                  id="qr-modal-img"
                  src={`/${slug}/qr`}
                  alt={`QR code for ${clipPathLabel}`}
                  width="222"
                  height="222"
                />
              </div>
              <p class="qr-modal__hint">
                {host}/<strong>{slug}</strong>
              </p>
            </div>
          </div>
        </div>

        {isPublic && (
          <div
            class={`modal-backdrop${showCloneModal ? " is-open" : ""}`}
            id="clone-modal-backdrop"
            hidden={!showCloneModal}
            data-clone-modal
          >
            <div
              class="modal clone-modal"
              id="clone-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="clone-modal-title"
              hidden={!showCloneModal}
            >
              <div class="modal__header">
                <h2 class="modal__title" id="clone-modal-title">
                  Clone this clip
                </h2>
                <button
                  type="button"
                  class="btn btn--ghost btn--icon"
                  data-close-clone-modal
                  aria-label="Close"
                >
                  <CloseIcon />
                </button>
              </div>
              <form method="post" action={`/${slug}/clone`} class="modal__body clone-modal__body">
                <p class="clone-modal__hint">
                  Creates a private copy you can edit. Leave the name blank for a random link.
                </p>
                <label class="clone-modal__label" for="clone-slug">
                  Custom name <span class="muted">(optional)</span>
                </label>
                <div class="clone-modal__slug-row">
                  <span class="clone-modal__prefix muted">{host}/</span>
                  <input
                    type="text"
                    id="clone-slug"
                    name="slug"
                    class="slug-input"
                    placeholder="my-clip"
                    pattern="[a-zA-Z0-9_-]{3,64}"
                    maxlength={64}
                    autocomplete="off"
                    spellcheck={false}
                    value={cloneSlugValue}
                    aria-invalid={cloneError ? "true" : undefined}
                    aria-describedby={cloneError ? "clone-slug-error" : "clone-slug-hint"}
                  />
                </div>
                {cloneError ? (
                  <p class="clone-modal__error" id="clone-slug-error" role="alert">
                    {cloneError}
                  </p>
                ) : (
                  <p class="clone-modal__field-hint" id="clone-slug-hint">
                    3–64 letters, numbers, hyphens, or underscores
                  </p>
                )}
                <div class="clone-modal__actions">
                  <button type="button" class="btn btn--ghost" data-close-clone-modal>
                    Cancel
                  </button>
                  <button type="submit" class="btn btn--primary" id="clone-clip-submit">
                    Clone
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div class="modal-backdrop docs-modal-backdrop" id="docs-modal-backdrop" hidden data-docs-modal>
          <div
            class="modal docs-modal"
            id="docs-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="docs-modal-title"
            hidden
          >
            <div class="modal__header docs-modal__header">
              <h2 class="modal__title" id="docs-modal-title">
                Developer docs
              </h2>
              <div class="docs-modal__header-actions">
                <a
                  href="/docs/api"
                  class="btn btn--ghost btn--sm"
                  id="docs-modal-open-page"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open page
                </a>
                <button
                  type="button"
                  class="btn btn--ghost btn--icon"
                  data-close-docs-modal
                  aria-label="Close documentation"
                >
                  <CloseIcon />
                </button>
              </div>
            </div>
            <nav class="docs-modal__nav" aria-label="Documentation sections">
              <button
                type="button"
                class="docs-modal__tab is-active"
                data-docs-path="/docs/api"
                aria-current="page"
              >
                REST API
              </button>
              <button type="button" class="docs-modal__tab" data-docs-path="/docs/webhooks">
                Webhooks
              </button>
            </nav>
            <div class="modal__body docs-modal__body" id="docs-modal-body" tabindex="0">
              <p class="docs-modal__loading">Loading documentation…</p>
            </div>
          </div>
        </div>
      </div>

      <script src={asset("clip-mobile.js")} defer></script>
      {!readOnly && <script src={asset("clip-settings.js")} defer></script>}
      <script src={asset("clip-editor.js")} defer></script>
      <script src={asset("e2e.js")} defer></script>
      {!readOnly && <script src={asset("clip-sync.js")} defer></script>}
    </Layout>
  );
}
