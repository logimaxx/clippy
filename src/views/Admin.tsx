/** @jsxImportSource hono/jsx */
import { Layout } from "./Layout";
import type { ClipStats, StatsHistoryPoint } from "../store/stats";
import type { ApiUsageStats } from "../lib/api-usage";

interface AdminPageProps {
  stats: ClipStats;
  history: StatsHistoryPoint[];
  adminPath: string;
}

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString();
}

function BreakdownTable({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: number }[];
}) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  return (
    <section class="admin-section">
      <h2>{title}</h2>
      <table class="admin-table">
        <thead>
          <tr>
            <th>Category</th>
            <th>Count</th>
            <th>Share</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr>
              <td>{row.label}</td>
              <td>{row.value}</td>
              <td>{total > 0 ? `${Math.round((row.value / total) * 100)}%` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** For metrics that are not parts of a whole, so a share column would mislead. */
function MetricsTable({
  title,
  note,
  rows,
}: {
  title: string;
  note?: string;
  rows: { label: string; value: number | string }[];
}) {
  return (
    <section class="admin-section">
      <h2>{title}</h2>
      {note && <p class="muted">{note}</p>}
      <table class="admin-table">
        <thead>
          <tr>
            <th>Metric</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr>
              <td>{row.label}</td>
              <td>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function StatsChart({
  points,
  label,
}: {
  points: { t: number; v: number }[];
  label: string;
}) {
  if (points.length < 2) {
    return <p class="muted">Not enough data yet — snapshots are recorded hourly.</p>;
  }

  const w = 640;
  const h = 220;
  const padX = 48;
  const padY = 32;
  const minT = points[0].t;
  const maxT = points[points.length - 1].t;
  const maxV = Math.max(...points.map((p) => p.v), 1);
  const rangeT = maxT - minT || 1;

  const coords = points
    .map((p) => {
      const x = padX + ((p.t - minT) / rangeT) * (w - padX * 2);
      const y = h - padY - (p.v / maxV) * (h - padY * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const gridY = [0, 0.5, 1].map((frac) => {
    const y = h - padY - frac * (h - padY * 2);
    const value = Math.round(maxV * frac);
    return { y, value };
  });

  return (
    <svg
      class="stats-chart"
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={label}
    >
      {gridY.map((line) => (
        <g>
          <line
            x1={padX}
            y1={line.y}
            x2={w - padX}
            y2={line.y}
            class="stats-chart-grid"
          />
          <text x={padX - 8} y={line.y + 4} class="stats-chart-label" text-anchor="end">
            {line.value}
          </text>
        </g>
      ))}
      <polyline points={coords} class="stats-chart-line" />
      <text x={padX} y={h - 8} class="stats-chart-label">
        {formatTime(minT)}
      </text>
      <text x={w - padX} y={h - 8} class="stats-chart-label" text-anchor="end">
        {formatTime(maxT)}
      </text>
    </svg>
  );
}

function apiUsageRows(api: ApiUsageStats) {
  return {
    resource: [
      { label: "Clips", value: api.byResource.clips },
      { label: "Files", value: api.byResource.files },
      { label: "Auth", value: api.byResource.auth },
      { label: "Other", value: api.byResource.other },
    ],
    auth: [
      { label: "Anonymous", value: api.byAuth.anonymous },
      { label: "API key", value: api.byAuth.api_key },
      { label: "Session", value: api.byAuth.session },
    ],
    method: [
      { label: "GET", value: api.byMethod.GET },
      { label: "POST", value: api.byMethod.POST },
      { label: "PUT", value: api.byMethod.PUT },
      { label: "DELETE", value: api.byMethod.DELETE },
      { label: "Other", value: api.byMethod.other },
    ],
  };
}

export function AdminPage({ stats, history, adminPath }: AdminPageProps) {
  const b = stats.breakdown;
  const api = stats.apiUsage;
  const apiRows = apiUsageRows(api);
  const accounts = stats.accounts;
  const teams = stats.teams;

  const clipChartPoints = history.map((point) => ({
    t: point.recordedAt,
    v: point.totalActive,
  }));

  const apiChartPoints = history.map((point) => ({
    t: point.recordedAt,
    v: point.apiUsage.total,
  }));

  const accountChartPoints = history.map((point) => ({
    t: point.recordedAt,
    v: point.accounts.total,
  }));

  const contentTypeRows = Object.entries(b.contentType)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value }));

  return (
    <Layout title="Admin — Webklip" description="Webklip admin statistics">
      <main class="home admin-page">
        <h1>Webklip stats</h1>
        <p class="muted">Aggregates only — no clip content or slugs. Updated {formatTime(stats.recordedAt)}.</p>

        <section class="admin-hero">
          <div class="admin-stat-card admin-stat-card-primary">
            <span class="admin-stat-label">Active clips</span>
            <span class="admin-stat-value">{stats.total}</span>
          </div>
          <div class="admin-stat-card">
            <span class="admin-stat-label">Created (24h)</span>
            <span class="admin-stat-value">{stats.createdLast24h}</span>
          </div>
          <div class="admin-stat-card">
            <span class="admin-stat-label">Created (7d)</span>
            <span class="admin-stat-value">{stats.createdLast7d}</span>
          </div>
        </section>

        <section class="admin-hero">
          <div class="admin-stat-card admin-stat-card-primary">
            <span class="admin-stat-label">Accounts</span>
            <span class="admin-stat-value">{accounts.total}</span>
          </div>
          <div class="admin-stat-card">
            <span class="admin-stat-label">Accounts (24h)</span>
            <span class="admin-stat-value">{accounts.createdLast24h}</span>
          </div>
          <div class="admin-stat-card">
            <span class="admin-stat-label">Accounts (7d)</span>
            <span class="admin-stat-value">{accounts.createdLast7d}</span>
          </div>
        </section>

        <section class="admin-hero">
          <div class="admin-stat-card admin-stat-card-primary">
            <span class="admin-stat-label">Teams</span>
            <span class="admin-stat-value">{teams.total}</span>
          </div>
          <div class="admin-stat-card">
            <span class="admin-stat-label">Teams (7d)</span>
            <span class="admin-stat-value">{teams.createdLast7d}</span>
          </div>
          <div class="admin-stat-card">
            <span class="admin-stat-label">Memberships</span>
            <span class="admin-stat-value">{teams.memberships}</span>
          </div>
          <div class="admin-stat-card">
            <span class="admin-stat-label">Team clips</span>
            <span class="admin-stat-value">{teams.clips.total}</span>
          </div>
        </section>

        <section class="admin-hero">
          <div class="admin-stat-card admin-stat-card-primary">
            <span class="admin-stat-label">API requests (24h)</span>
            <span class="admin-stat-value">{stats.apiRequestsLast24h}</span>
          </div>
          <div class="admin-stat-card">
            <span class="admin-stat-label">API requests (current period)</span>
            <span class="admin-stat-value">{api.total}</span>
          </div>
          <div class="admin-stat-card">
            <span class="admin-stat-label">Rate limited (current)</span>
            <span class="admin-stat-value">{api.rateLimited}</span>
          </div>
        </section>

        <section class="admin-section">
          <h2>Active clips over time</h2>
          <StatsChart points={clipChartPoints} label="Active clips over time" />
        </section>

        <section class="admin-section">
          <h2>Accounts over time</h2>
          <StatsChart points={accountChartPoints} label="Accounts over time" />
        </section>

        <section class="admin-section">
          <h2>API requests per snapshot</h2>
          <p class="muted">Requests counted in each hourly snapshot window (excludes /api/health).</p>
          <StatsChart points={apiChartPoints} label="API requests per snapshot" />
        </section>

        <MetricsTable
          title="Accounts"
          rows={[
            { label: "Total", value: accounts.total },
            { label: "Email verified", value: accounts.verified },
            { label: "Awaiting verification", value: accounts.unverified },
            { label: "With password", value: accounts.withPassword },
            { label: "With OAuth link", value: accounts.withOauth },
            { label: "With API key", value: accounts.withApiKey },
            { label: "Member of a team", value: accounts.inTeam },
            { label: "Created (24h)", value: accounts.createdLast24h },
            { label: "Created (7d)", value: accounts.createdLast7d },
          ]}
        />

        <MetricsTable
          title="Teams"
          rows={[
            { label: "Total", value: teams.total },
            { label: "Created (24h)", value: teams.createdLast24h },
            { label: "Created (7d)", value: teams.createdLast7d },
            { label: "Memberships", value: teams.memberships },
            { label: "Members per team (avg)", value: teams.averageMembers },
            { label: "Largest team (members)", value: teams.largestMembers },
            { label: "Pending invites", value: teams.pendingInvites },
          ]}
        />

        <BreakdownTable
          title="Team size"
          rows={[
            { label: "Owner only", value: teams.memberSizes.solo },
            { label: "2–5 members", value: teams.memberSizes.small },
            { label: "6–20 members", value: teams.memberSizes.medium },
            { label: "21+ members", value: teams.memberSizes.large },
          ]}
        />

        <MetricsTable
          title="Team clips"
          note="Clips living under a team namespace, and how they spread across teams."
          rows={[
            { label: "Clips in teams", value: teams.clips.total },
            { label: "Personal clips (owned, no team)", value: b.audience.personal },
            { label: "Anonymous clips", value: b.audience.anonymous },
            { label: "Clips per team (avg)", value: teams.clips.averagePerTeam },
            { label: "Busiest team (clips)", value: teams.clips.largestTeam },
            { label: "Teams with clips", value: teams.clips.teamsWithClips },
            { label: "Teams without clips", value: teams.clips.teamsWithoutClips },
          ]}
        />

        <BreakdownTable
          title="Clips per team"
          rows={[
            { label: "No clips", value: teams.clips.distribution.none },
            { label: "1–9 clips", value: teams.clips.distribution.few },
            { label: "10–49 clips", value: teams.clips.distribution.some },
            { label: "50+ clips", value: teams.clips.distribution.many },
          ]}
        />

        <BreakdownTable title="API resource (current period)" rows={apiRows.resource} />
        <BreakdownTable title="API auth (current period)" rows={apiRows.auth} />
        <BreakdownTable title="API method (current period)" rows={apiRows.method} />

        <BreakdownTable
          title="Read behavior"
          rows={[
            { label: "Burn on read", value: b.burnOnRead.true },
            { label: "Persistent", value: b.burnOnRead.false },
          ]}
        />

        <BreakdownTable
          title="View limits"
          rows={[
            { label: "No limit", value: b.maxViews.none },
            { label: "Single view", value: b.maxViews.one },
            { label: "Multi-view", value: b.maxViews.many },
          ]}
        />

        <BreakdownTable
          title="Expiry"
          rows={[
            { label: "No expiry", value: b.ttl.none },
            { label: "TTL set", value: b.ttl.set },
          ]}
        />

        <BreakdownTable
          title="Protection"
          rows={[
            { label: "PIN protected", value: b.pin.set },
            { label: "Open", value: b.pin.none },
            { label: "Encrypted", value: b.encrypted.true },
            { label: "Not encrypted", value: b.encrypted.false },
          ]}
        />

        <BreakdownTable
          title="Attachments"
          rows={[
            { label: "With files", value: b.attachments.yes },
            { label: "Text only", value: b.attachments.no },
          ]}
        />

        <BreakdownTable
          title="Ownership"
          rows={[
            { label: "Anonymous", value: b.audience.anonymous },
            { label: "Personal (signed in)", value: b.audience.personal },
            { label: "Team", value: b.audience.team },
          ]}
        />

        {contentTypeRows.length > 0 && (
          <BreakdownTable title="Content type" rows={contentTypeRows} />
        )}

        <p class="muted admin-footer">
          JSON: <a href={`${adminPath}/api/stats`}>{adminPath}/api/stats</a>
          {" · "}
          <a href={`${adminPath}/api/history`}>{adminPath}/api/history</a>
        </p>
      </main>
    </Layout>
  );
}
