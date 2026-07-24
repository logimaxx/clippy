/** @jsxImportSource hono/jsx */
import { Layout } from "./Layout";

interface PinGateProps {
  slug: string;
  error?: string;
  remaining?: number;
}

export function PinGate({ slug, error, remaining }: PinGateProps) {
  return (
    <Layout title={`Webklip — ${slug} (locked)`}>
      <main class="home pin-gate">
        <h1>🔒 PIN required</h1>
        <p class="tagline">This clip is protected. Enter the PIN to continue.</p>
        {error && <p class="pin-error">{error}</p>}
        {remaining !== undefined && remaining < 5 && (
          <p class="pin-warning">{remaining} attempt(s) remaining</p>
        )}
        <form method="post" action={`/${slug}/unlock`} class="home-form">
          <input
            type="password"
            name="pin"
            placeholder="PIN"
            class="slug-input"
            autocomplete="off"
            required
            minlength={1}
            maxlength={128}
          />
          <button type="submit" class="btn btn-primary">
            Unlock
          </button>
        </form>
        <p class="hint">
          <a href="/">← Back home</a>
        </p>
      </main>
    </Layout>
  );
}
