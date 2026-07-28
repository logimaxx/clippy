# OAuth app registration (Google & GitHub)

Optional Google and GitHub sign-in for Webklip accounts. A provider’s button appears on `/login` and `/register` only when **both** client ID and secret for that provider are set.

## Prerequisites

- Public `SITE_URL` with **no trailing slash** (e.g. `https://webklip.com`)
- For local dev, use the same origin the app listens on (e.g. `http://localhost:3000`)
- Redirect URIs must match `{SITE_URL}/auth/{provider}/callback` **exactly** (scheme, host, path)

| Provider | Start URL | Callback URL |
|----------|-----------|--------------|
| Google | `{SITE_URL}/auth/google` | `{SITE_URL}/auth/google/callback` |
| GitHub | `{SITE_URL}/auth/github` | `{SITE_URL}/auth/github/callback` |

Scopes we request:

- **Google:** `openid`, `email`, `profile` (verified email required)
- **GitHub:** `read:user`, `user:email` (verified email preferred)

## Google

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create or select a project.
2. **APIs & Services → OAuth consent screen**
   - User type: **External** (unless the app is Google Workspace–only)
   - Fill app name, user support email, and developer contact
   - Scopes: defaults are fine; Webklip requests `openid` / `email` / `profile` at authorize time
   - While the consent screen is in **Testing**, add every Google account that should be able to sign in as a test user
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application**
   - Name: e.g. `Webklip`
   - **Authorized redirect URIs** — add one per environment, for example:
     - Production: `https://webklip.com/auth/google/callback`
     - Local: `http://localhost:3000/auth/google/callback`
4. Copy the **Client ID** and **Client secret**.

Publish the consent screen when you are ready for users outside the test list. Google may require verification for sensitive/restricted scopes; the scopes we use are standard and usually do not need a full verification review for basic sign-in.

## GitHub

1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**  
   (For an organization: org **Settings → Developer settings → OAuth Apps**.)
2. Fill in:
   - **Application name:** e.g. `Webklip`
   - **Homepage URL:** your `SITE_URL` (e.g. `https://webklip.com`)
   - **Authorization callback URL:** `{SITE_URL}/auth/github/callback`  
     Example: `https://webklip.com/auth/github/callback`
3. Create the app, then **Generate a new client secret**.
4. Copy the **Client ID** and the new **Client secret**.

Use a separate OAuth App (or a second callback URI if you keep one app) for local vs production so callback URLs stay exact.

## Environment variables

Add to `.env` (see `.env.example`):

```env
SITE_URL=https://webklip.com

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
```

You can enable only one provider. Restart the server after changing env vars.

## Account linking

- First successful OAuth sign-in creates a user with no password (or links an existing user with the **same verified email**).
- Password login still works for accounts that have a password; OAuth-only users must use Google/GitHub.
- Email must be verified by the provider; otherwise sign-in fails with an error on `/login`.

## Checklist

- [ ] `SITE_URL` matches the public origin (no trailing slash)
- [ ] Google redirect URI(s) registered and secrets in `.env`
- [ ] GitHub callback URL registered and secrets in `.env`
- [ ] Server restarted
- [ ] `/login` shows the expected Continue with Google / GitHub buttons
- [ ] Test a full sign-in → lands on `/account` with a session cookie
