/** @jsxImportSource hono/jsx */
import { AccountShell, type AccountCounts } from "./partials/AccountShell";
import { formatExpiresIn } from "../lib/constants";
import { isExpiringSoon, type OwnedClipRow } from "../store/clips";
import { clipPreviewText } from "../lib/explore-preview";
import type { AuthUser } from "../lib/session";

export type ClipsDensity = "list" | "cards";

export interface MyClipsFilters {
  team: "all" | "personal" | string;
  visibility: "all" | "private" | "public";
  expiringSoon: boolean;
  density: ClipsDensity;
}

interface TeamOption {
  slug: string;
  name: string;
  role: string;
}

interface MyClipsPageProps {
  user: Pick<AuthUser, "id" | "email" | "name">;
  clips: OwnedClipRow[];
  teams: TeamOption[];
  filters: MyClipsFilters;
  counts: AccountCounts;
  createError?: string | null;
  createSlug?: string | null;
  createNotice?: string | null;
}

function clipsHref(filters: MyClipsFilters, patch: Partial<MyClipsFilters> = {}): string {
  const next = { ...filters, ...patch };
  const params = new URLSearchParams();
  if (next.team !== "all") params.set("team", next.team);
  if (next.visibility !== "all") params.set("visibility", next.visibility);
  if (next.expiringSoon) params.set("soon", "1");
  if (next.density !== "list") params.set("density", next.density);
  const qs = params.toString();
  return qs ? `/account?${qs}` : "/account";
}

function ClipMetaChips({ clip }: { clip: OwnedClipRow }) {
  return (
    <span class="my-clips-chips">
      {clip.teamSlug && (
        <span class="badge badge--team" title={clip.teamName ?? clip.teamSlug}>
          {clip.teamName ?? clip.teamSlug}
        </span>
      )}
      <span class={`badge badge--${clip.visibility}`}>
        {clip.visibility === "public" ? "Public" : "Private"}
      </span>
      {clip.burnOnRead && <span class="badge">Burn on read</span>}
      {clip.encrypted && <span class="badge">Passphrase</span>}
      {clip.maxViews != null && clip.maxViews > 0 && (
        <span class="badge">
          {Math.max(0, clip.maxViews - clip.viewCount)} views left
        </span>
      )}
    </span>
  );
}

function ClipExpiry({ clip }: { clip: OwnedClipRow }) {
  const soon = isExpiringSoon(clip.expiresAt);
  return (
    <span class={`my-clips-expires${soon ? " is-soon" : ""}`}>
      {formatExpiresIn(clip.expiresAt)}
    </span>
  );
}

export function MyClipsPage({
  user,
  clips,
  teams,
  filters,
  counts,
  createError,
  createSlug,
  createNotice,
}: MyClipsPageProps) {
  const taken = createError === "taken" && createSlug ? createSlug : null;
  const selectedTeam =
    filters.team !== "all" && filters.team !== "personal"
      ? teams.find((t) => t.slug === filters.team)
      : undefined;
  const createUnderTeam = selectedTeam && selectedTeam.role !== "viewer";
  const viewerOnly = selectedTeam && selectedTeam.role === "viewer";
  const hasFilters =
    filters.team !== "all" || filters.visibility !== "all" || filters.expiringSoon;
  const createOpen = Boolean(createError) || clips.length === 0;

  return (
    <AccountShell
      user={user}
      tab="clips"
      title="My clips"
      subtitle="Clips saved to your account. Expired clips are deleted automatically."
      counts={counts}
    >
      <details class="account-card my-clips-create" open={createOpen}>
        <summary>New clip</summary>

        {createNotice && <p class="success">{createNotice}</p>}
        {createError && createError !== "taken" && (
          <p class="pin-error">{createError}</p>
        )}

        {selectedTeam ? (
          viewerOnly ? (
            <p class="my-clips-create-hint">
              You have viewer access on {selectedTeam.name}, so you can open its clips
              but not create new ones.
            </p>
          ) : (
            <>
              <p class="my-clips-create-hint">
                Creating in team <strong>{selectedTeam.name}</strong> at{" "}
                <code>/{selectedTeam.slug}/your-clip</code>.
              </p>
              <form
                action={`/${selectedTeam.slug}/new-clip`}
                method="post"
                class="home-form home-form--row my-clips-create-form"
              >
                <input type="hidden" name="from" value="account" />
                <div class="my-clips-create-row">
                  <input
                    type="text"
                    name="name"
                    placeholder="clip-name"
                    pattern="[a-zA-Z0-9_-]{2,64}"
                    class="slug-input"
                    required
                    autocomplete="off"
                    aria-label="Team clip name"
                  />
                  <button type="submit" class="btn btn-primary">
                    Create team clip
                  </button>
                </div>
              </form>
            </>
          )
        ) : (
          <>
            <p class="my-clips-create-hint">
              Paste text now or start empty — the clip is owned by your account.
            </p>
            <form
              action="/new"
              method="post"
              class="home-form home-form--row my-clips-create-form"
            >
              <input type="hidden" name="from" value="account" />
              <label class="sr-only" for="account-paste">
                Paste text to share
              </label>
              <textarea
                id="account-paste"
                name="content"
                class="home-paste-input"
                rows={4}
                placeholder="Paste text here…"
                spellcheck={false}
              ></textarea>
              <div class="my-clips-create-row">
                <input
                  type="text"
                  id="account-slug"
                  name="slug"
                  value={taken ?? ""}
                  placeholder="custom-name (optional)"
                  pattern="[a-zA-Z0-9_-]{3,64}"
                  class={`slug-input${taken ? " is-invalid" : ""}`}
                  autocomplete="off"
                  aria-label="Custom clip name (optional)"
                  aria-describedby="account-create-status"
                />
                <button type="submit" class="btn btn-primary">
                  Create clip
                </button>
              </div>
              <p
                class={`landing-create-status${taken ? " is-error" : ""}`}
                id="account-create-status"
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
          </>
        )}
      </details>

      <div class="my-clips-toolbar">
        <form method="get" action="/account" class="my-clips-filters" role="search">
          {filters.density !== "list" && (
            <input type="hidden" name="density" value={filters.density} />
          )}
          <label class="sr-only" for="filter-team">
            Team
          </label>
          <select id="filter-team" name="team" class="slug-input" data-autosubmit>
            <option value="all" selected={filters.team === "all"}>
              All clips
            </option>
            <option value="personal" selected={filters.team === "personal"}>
              Personal only
            </option>
            {teams.map((t) => (
              <option value={t.slug} selected={filters.team === t.slug}>
                Team: {t.name}
              </option>
            ))}
          </select>

          <label class="sr-only" for="filter-visibility">
            Visibility
          </label>
          <select id="filter-visibility" name="visibility" class="slug-input" data-autosubmit>
            <option value="all" selected={filters.visibility === "all"}>
              Any visibility
            </option>
            <option value="private" selected={filters.visibility === "private"}>
              Private
            </option>
            <option value="public" selected={filters.visibility === "public"}>
              Public
            </option>
          </select>

          <label class="my-clips-soon-toggle">
            <input
              type="checkbox"
              name="soon"
              value="1"
              checked={filters.expiringSoon}
              data-autosubmit
            />
            Expiring in 24h
          </label>

          <button type="submit" class="btn btn-ghost btn-small">
            Apply
          </button>
          {hasFilters && (
            <a href="/account" class="btn btn-ghost btn-small">
              Clear
            </a>
          )}
        </form>

        <div class="my-clips-density" role="group" aria-label="List density">
          <a
            href={clipsHref(filters, { density: "list" })}
            class={`my-clips-density-btn${filters.density === "list" ? " is-active" : ""}`}
            aria-current={filters.density === "list" ? "true" : undefined}
          >
            List
          </a>
          <a
            href={clipsHref(filters, { density: "cards" })}
            class={`my-clips-density-btn${filters.density === "cards" ? " is-active" : ""}`}
            aria-current={filters.density === "cards" ? "true" : undefined}
          >
            Cards
          </a>
        </div>
      </div>

      {clips.length > 0 && (
        <p class="my-clips-count">
          {clips.length} clip{clips.length === 1 ? "" : "s"}
          {hasFilters ? " matching your filters" : ""}
        </p>
      )}

      <div
        class={`account-card${filters.density === "list" ? " account-card--flush" : ""}`}
      >
        {clips.length === 0 ? (
          <p class="account-empty">
            <strong>{hasFilters ? "Nothing matches these filters" : "No clips yet"}</strong>
            {hasFilters
              ? "Try clearing the filters, or create a clip above."
              : "Create your first clip above — it stays linked to your account until it expires."}
          </p>
        ) : (
          <ul
            class={`my-clips-list my-clips-list--${filters.density}`}
            aria-label="Your clips"
          >
            {clips.map((clip) => (
              <li
                class={`my-clips-item${isExpiringSoon(clip.expiresAt) ? " is-soon" : ""}`}
              >
                <a href={`/${clip.slug}`} class="my-clips-link">
                  <span class="my-clips-slug">{clip.slug}</span>
                  {filters.density === "cards" && (
                    <span class="my-clips-preview">
                      {clip.encrypted
                        ? "Passphrase-protected clip"
                        : clipPreviewText(clip.content, 120)}
                    </span>
                  )}
                  <ClipMetaChips clip={clip} />
                  <ClipExpiry clip={clip} />
                </a>
                <button
                  type="button"
                  class="btn btn-ghost btn-small my-clips-copy"
                  data-copy-url={`/${clip.slug}`}
                >
                  Copy link
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AccountShell>
  );
}
