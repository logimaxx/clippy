/** @jsxImportSource hono/jsx */
import { Layout } from "./Layout";
import { clipSeoMeta, humanizeSlug } from "../lib/clip-seo";

interface ClipLinkPreviewProps {
  slug: string;
  /** When set, render indexable public content for crawlers. */
  content?: string;
}

export function ClipLinkPreview({ slug, content }: ClipLinkPreviewProps) {
  const publicContent = content?.trim() ? content : null;

  if (publicContent) {
    const meta = clipSeoMeta(slug, publicContent);
    return (
      <Layout
        title={meta.title}
        description={meta.description}
        ogTitle={meta.ogTitle}
        ogDescription={meta.ogDescription}
      >
        <main class="home clip-crawler">
          <p class="explore-kicker">
            <a href="/">webklip</a>
          </p>
          <h1>{humanizeSlug(slug)}</h1>
          <p class="tagline">Public clip — shared on Webklip</p>
          <article class="clip-crawler-article">
            <pre class="clip-crawler-content">{publicContent}</pre>
          </article>
          <p class="hint">
            <a href={`/${slug}`}>Open interactive clip</a>
            {" · "}
            <a href="/explore">Explore</a>
          </p>
        </main>
      </Layout>
    );
  }

  return (
    <Layout
      title={`Webklip — ${slug}`}
      description="One-time secure clipboard link on Webklip."
      ogTitle="Webklip — Secure clipboard"
      ogDescription="Open this link to view a one-time clip."
      robots="noindex, nofollow"
    >
      <main class="home pin-gate">
        <h1>Webklip</h1>
        <p class="tagline">One-time clipboard link. Open in your browser to view.</p>
        <p class="hint">
          <a href={`/${slug}`}>Open clip</a>
        </p>
      </main>
    </Layout>
  );
}
