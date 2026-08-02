/** @jsxImportSource hono/jsx */
import { Layout } from "./Layout";
import { SiteHeader } from "./partials/SiteHeader";
import type { AuthUser } from "../lib/session";

interface AppHomeProps {
  user: AuthUser | null;
  createError?: string | null;
  createSlug?: string | null;
}

export function AppHome({ user, createError, createSlug }: AppHomeProps) {
  const taken =
    createError === "taken" && createSlug
      ? createSlug
      : null;

  return (
    <Layout
      title="Webklip — Online Clipboard"
      description="Create a temporary clip to share text and files. Live sync, no account required."
      themeToggle="none"
      bodyClass="with-chrome"
      robots="noindex"
    >
      <SiteHeader variant="app" user={user} />
      <main class="home app-home">
        <h1>Online clipboard</h1>
        <p class="tagline">
          Paste text or leave it empty, optionally choose a name, then create a clip.
          Share the link — it expires in 15 minutes by default.
        </p>

        <form
          action="/new"
          method="post"
          class="home-form landing-cta landing-hero-paste"
          id="create-klip"
        >
          <label class="sr-only" for="home-paste">
            Paste text to share
          </label>
          <textarea
            id="home-paste"
            name="content"
            class="home-paste-input"
            rows="9"
            placeholder="Paste text here…"
            spellcheck="false"
          ></textarea>
          <div class="landing-hero-paste-bar">
            <input
              type="text"
              id="home-slug"
              name="slug"
              value={taken ?? ""}
              placeholder="custom-name (optional)"
              pattern="[a-zA-Z0-9_-]{3,64}"
              class={`slug-input${taken ? " is-invalid" : ""}`}
              autocomplete="off"
              aria-label="Custom clip name (optional)"
              aria-describedby="create-slug-status"
            />
            <button type="submit" class="btn btn-primary btn-lg">
              Create a Clip
            </button>
          </div>
          <p
            class={`landing-create-status${taken ? " is-error" : ""}`}
            id="create-slug-status"
            hidden={!taken}
            role="status"
          >
            {taken ? (
              <>
                “{taken}” is already taken.{" "}
                <a href={`/${encodeURIComponent(taken)}`}>Open existing clip →</a>
              </>
            ) : null}
          </p>
        </form>

        <p class="hint">
          Or open any path like <code>/my-clip</code> to start sharing.
        </p>

        {!user && (
          <p class="app-home-auth">
            <a href="/login" class="btn btn-ghost">
              Log in
            </a>
            <a href="/register" class="btn btn-ghost">
              Register
            </a>
          </p>
        )}
      </main>
    </Layout>
  );
}
