/** @jsxImportSource hono/jsx */
import { Layout } from "./Layout";
import { SiteHeader } from "./partials/SiteHeader";
import { SiteFooter } from "./partials/SiteFooter";
import { clipPreviewText, formatClipDate } from "../lib/explore-preview";
import type { Clip } from "../db/schema";

interface KlipwallPageProps {
  clips: Clip[];
  query?: string;
  page?: number;
  totalPages?: number;
  total?: number;
}

function klipwallHref(page: number, query: string): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/klipwall?${qs}` : "/klipwall";
}

export function KlipwallPage({
  clips,
  query = "",
  page = 1,
  totalPages = 1,
  total = 0,
}: KlipwallPageProps) {
  const searching = query.length > 0;
  const showPager = total > 0 && totalPages > 1;

  return (
    <Layout
      title="Klipwall — Webklip"
      description="Browse public Webklip clips shared by the community."
      themeToggle="none"
      bodyClass="with-chrome"
    >
      <SiteHeader />
      <main class="home explore-page">
        <h1>Klipwall</h1>
        <p class="tagline">
          Public clips anyone can open. Make a clip public from its settings to list it here.
        </p>

        <form method="get" action="/klipwall" class="explore-search" role="search">
          <label class="sr-only" for="klipwall-q">
            Search Klipwall
          </label>
          <input
            id="klipwall-q"
            type="search"
            name="q"
            value={query}
            placeholder="Search by name or content…"
            class="slug-input"
            autocomplete="off"
            maxlength={100}
          />
          <button type="submit" class="btn btn-primary">
            Search
          </button>
          {searching && (
            <a href="/klipwall" class="explore-search-clear muted">
              Clear
            </a>
          )}
        </form>

        {clips.length === 0 ? (
          <p class="explore-empty muted">
            {searching ? (
              <>
                No public clips match “{query}”.{" "}
                <a href="/klipwall">Clear search</a>
              </>
            ) : (
              <>
                No public clips yet.{" "}
                <a href="/">Create a clip</a> and turn on Public in settings.
              </>
            )}
          </p>
        ) : (
          <>
            <p class="explore-count muted">
              {searching
                ? `${total} result${total === 1 ? "" : "s"} for “${query}”`
                : `${total} public clip${total === 1 ? "" : "s"}`}
              {showPager ? ` · Page ${page} of ${totalPages}` : ""}
            </p>
            <ul class="explore-list">
              {clips.map((clip) => (
                <li class="explore-item">
                  <a href={`/${clip.slug}`} class="explore-link">
                    <span class="explore-slug">{clip.slug}</span>
                    <span class="explore-preview">{clipPreviewText(clip.content)}</span>
                    <span class="explore-meta muted">{formatClipDate(clip.createdAt)}</span>
                  </a>
                </li>
              ))}
            </ul>
            {showPager && (
              <nav class="explore-pager" aria-label="Klipwall pages">
                {page > 1 ? (
                  <a href={klipwallHref(page - 1, query)} class="btn btn-ghost" rel="prev">
                    ← Newer
                  </a>
                ) : (
                  <span class="btn btn-ghost explore-pager-disabled" aria-disabled="true">
                    ← Newer
                  </span>
                )}
                <span class="explore-pager-status muted">
                  Page {page} of {totalPages}
                </span>
                {page < totalPages ? (
                  <a href={klipwallHref(page + 1, query)} class="btn btn-ghost" rel="next">
                    Older →
                  </a>
                ) : (
                  <span class="btn btn-ghost explore-pager-disabled" aria-disabled="true">
                    Older →
                  </span>
                )}
              </nav>
            )}
          </>
        )}
      </main>
      <SiteFooter />
    </Layout>
  );
}
