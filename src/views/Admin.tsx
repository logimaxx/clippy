/** @jsxImportSource hono/jsx */
import { Layout } from "./Layout";
import type { ClipStats, ClipStatsBreakdown } from "../store/stats";

interface HistoryPoint {
  recordedAt: number;
  totalActive: number;
  breakdown: ClipStatsBreakdown;
}

interface AdminPageProps {
  stats: ClipStats;
  history: HistoryPoint[];
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

function StatsChart({ points }: { points: { t: number; v: number }[] }) {
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
      aria-label="Active clips over time"
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

export function AdminPage({ stats, history, adminPath }: AdminPageProps) {
  const b = stats.breakdown;
  const chartPoints = history.map((point) => ({
    t: point.recordedAt,
    v: point.totalActive,
  }));

  const contentTypeRows = Object.entries(b.contentType)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value }));

  return (
    <Layout title="Admin — Clippy" description="Clippy admin statistics">
      <main class="home admin-page">
        <h1>Clippy stats</h1>
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

        <section class="admin-section">
          <h2>Active clips over time</h2>
          <StatsChart points={chartPoints} />
        </section>

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
          title="Lifetime"
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
            { label: "Anonymous", value: b.ownership.anonymous },
            { label: "Authenticated", value: b.ownership.authenticated },
            { label: "Team clip", value: b.team.set },
            { label: "Personal", value: b.team.none },
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
