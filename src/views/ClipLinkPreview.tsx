/** @jsxImportSource hono/jsx */
import { Layout } from "./Layout";

interface ClipLinkPreviewProps {
  slug: string;
}

export function ClipLinkPreview({ slug }: ClipLinkPreviewProps) {
  return (
    <Layout
      title={`Webklip — ${slug}`}
      description="One-time secure clipboard link on Webklip."
      ogTitle="Webklip — Secure clipboard"
      ogDescription="Open this link to view a one-time clip."
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
