/** @jsxImportSource hono/jsx */
import { Layout } from "./Layout";
import { SettingsPanel, filesPanelMeta } from "./partials/Settings";
import { FileAttachment } from "./partials/FileAttachment";
import {
  ShareIcon,
  CopyIcon,
  QrIcon,
  NativeShareIcon,
  EditorNavIcon,
  FilesNavIcon,
  SettingsNavIcon,
} from "./partials/ClipIcons";
import { asset } from "../lib/assets";
import { clipAnalyticsPath } from "../lib/umami";
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
  webhookUrl: string | null;
  devices: number;
  clip: Clip;
  versions: ClipVersion[];
  encrypted: boolean;
  readOnly?: boolean;
  burned?: boolean;
}

export function ClipPage({
  slug,
  content,
  expiresAt,
  burnOnRead,
  language,
  maxViews,
  hasPin,
  webhookUrl,
  devices,
  clip,
  versions,
  encrypted,
  readOnly = false,
  burned = false,
}: ClipPageProps) {
  const files = getClipFiles(clip);
  const deviceLabel = `${devices} device${devices === 1 ? "" : "s"}`;

  return (
    <Layout title={`Webklip — ${slug}`} analyticsPath={clipAnalyticsPath(slug)}>
      <div class="app" data-view="editor">
        <header class="header">
          <a href="/" class="logo" aria-label="Webklip home">
            <span class="logo-mark" aria-hidden="true">
              C
            </span>
            webklip
          </a>

          <div class="url-bar" role="group" aria-label="Clip URL">
            <span class="url-bar__path">
              webklip.app/<strong>{slug}</strong>
            </span>
          </div>

          <div class="header-chips" aria-hidden="false">
            <span class="chip chip--live chip--devices">
              <span class="pulse" aria-hidden="true"></span>
              <span id="device-count-desktop">{deviceLabel}</span>
            </span>
            {encrypted && <span class="chip chip--secure">E2E</span>}
          </div>

          <div class="header-actions">
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
          <SettingsPanel
            slug={slug}
            expiresAt={expiresAt}
            burnOnRead={burnOnRead}
            language={language}
            maxViews={maxViews}
            hasPin={hasPin}
            webhookUrl={webhookUrl}
            encrypted={encrypted}
            devices={devices}
            versions={versions}
            files={files}
          />

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
                      />
                    ))
                  ) : (
                    <div id="clip-files-empty" class="empty-state">
                      No files attached yet.
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
          <button type="button" class="bottom-nav__item" data-open-sheet="settings">
            <SettingsNavIcon />
            Settings
          </button>
        </nav>
      </div>

      <script src={asset("clip-mobile.js")} defer></script>
      <script src={asset("clip-editor.js")} defer></script>
      <script src={asset("e2e.js")} defer></script>
      {!readOnly && <script src={asset("clip-sync.js")} defer></script>}
    </Layout>
  );
}
