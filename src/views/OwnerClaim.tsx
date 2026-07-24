/** @jsxImportSource hono/jsx */
import { Layout } from "./Layout";
import { clipAnalyticsPath } from "../lib/umami";

interface OwnerClaimProps {
  slug: string;
  error?: string;
  remaining?: number;
}

export function OwnerClaim({ slug, error, remaining }: OwnerClaimProps) {
  return (
    <Layout
      title={`Webklip - ${slug} (recover)`}
      analyticsPath={clipAnalyticsPath(slug)}
    >
      <main class="home pin-gate">
        <h1>Recover ownership</h1>
        <p class="tagline">
          Enter the owner password for <strong>{slug}</strong> to restore edit access on
          this device.
        </p>
        {error && <p class="pin-error">{error}</p>}
        {remaining !== undefined && remaining < 5 && (
          <p class="pin-warning">{remaining} attempt(s) remaining</p>
        )}
        <form method="post" action={`/${slug}/claim`} class="home-form">
          <input
            type="password"
            name="ownerPassword"
            placeholder="Owner password"
            class="slug-input"
            autocomplete="current-password"
            required
            minlength={8}
            maxlength={128}
          />
          <button type="submit" class="btn btn-primary">
            Recover access
          </button>
        </form>
        <p class="hint">
          <a href={`/${slug}`}>Back to clip</a>
          {" · "}
          <a href="/">Home</a>
        </p>
      </main>
    </Layout>
  );
}
