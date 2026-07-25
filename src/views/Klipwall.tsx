/** @jsxImportSource hono/jsx */
import { Layout } from "./Layout";
import { clipPreviewText, formatClipDate } from "../lib/explore-preview";
import type { Clip } from "../db/schema";

interface KlipwallPageProps {
  clips: Clip[];
}

export function KlipwallPage({ clips }: KlipwallPageProps) {
  return (
    <Layout
      title="Klipwall — Webklip"
      description="Browse public Webklip clips shared by the community."
    >
      <main class="home explore-page">
        <p class="explore-kicker">
          <a href="/" class="logo">webklip</a>
        </p>
        <h1>Klipwall</h1>
        <p class="tagline">
          Public clips anyone can open. Make a clip public from its settings to list it here.
        </p>

        {clips.length === 0 ? (
          <p class="explore-empty muted">
            No public clips yet.{" "}
            <a href="/">Create a clip</a> and turn on Public in settings.
          </p>
        ) : (
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
        )}
      </main>
    </Layout>
  );
}
