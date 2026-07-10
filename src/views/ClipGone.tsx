/** @jsxImportSource hono/jsx */
import { Layout } from "./Layout";

interface ClipGoneProps {
  slug: string;
}

export function ClipGone({ slug }: ClipGoneProps) {
  return (
    <Layout
      title={`Clippy — ${slug} (gone)`}
      description="This clip has already been read or has expired."
      ogTitle="Clippy — Clip unavailable"
      ogDescription="This one-time clip has already been read or has expired."
    >
      <main class="home pin-gate">
        <h1>Clip unavailable</h1>
        <p class="tagline">
          This clip was already read, burned, or has expired.
        </p>
        <p class="hint">
          <a href="/">← Create a new clip</a>
        </p>
      </main>
    </Layout>
  );
}
