/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import { LoginPage } from "../views/Account";
import { setSessionCookie } from "../lib/session";
import {
  buildAuthorizationUrl,
  clearOauthStateCookie,
  createOauthState,
  enabledOauthProviders,
  fetchOauthProfile,
  findOrCreateOauthUser,
  getOauthProviderConfig,
  isOauthProvider,
  readOauthStateCookie,
  setOauthStateCookie,
  verifyOauthState,
} from "../lib/oauth";

const oauth = new Hono();

function loginError(error: string) {
  return <LoginPage error={error} oauthProviders={enabledOauthProviders()} />;
}

oauth.get("/auth/:provider", async (c) => {
  const providerParam = c.req.param("provider");
  if (!isOauthProvider(providerParam)) {
    return c.html(loginError("Unknown sign-in provider"), 400);
  }
  if (!getOauthProviderConfig(providerParam)) {
    return c.html(loginError(`${providerParam} sign-in is not configured`), 503);
  }

  const state = createOauthState(providerParam);
  const url = buildAuthorizationUrl(providerParam, state);
  if (!url) {
    return c.html(loginError(`${providerParam} sign-in is not configured`), 503);
  }

  setOauthStateCookie(c, state);
  return c.redirect(url, 302);
});

oauth.get("/auth/:provider/callback", async (c) => {
  const providerParam = c.req.param("provider");
  if (!isOauthProvider(providerParam)) {
    return c.html(loginError("Unknown sign-in provider"), 400);
  }

  const error = c.req.query("error");
  if (error) {
    clearOauthStateCookie(c);
    return c.html(loginError("Sign-in was cancelled"));
  }

  const code = c.req.query("code");
  const state = c.req.query("state");
  const cookieState = readOauthStateCookie(c);
  clearOauthStateCookie(c);

  if (
    !code ||
    !state ||
    !cookieState ||
    state !== cookieState ||
    !verifyOauthState(state, providerParam)
  ) {
    return c.html(loginError("Invalid or expired sign-in session"));
  }

  if (!getOauthProviderConfig(providerParam)) {
    return c.html(loginError(`${providerParam} sign-in is not configured`), 503);
  }

  const profile = await fetchOauthProfile(providerParam, code);
  if (!profile) {
    return c.html(loginError("Could not read a verified email from the provider"));
  }

  try {
    const user = await findOrCreateOauthUser(profile);
    setSessionCookie(c, user.id);
    return c.redirect("/account", 302);
  } catch {
    return c.html(loginError("Could not complete sign-in"));
  }
});

export { oauth };
