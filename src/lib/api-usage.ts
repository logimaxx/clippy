export interface ApiUsageStats {
  total: number;
  rateLimited: number;
  byResource: {
    clips: number;
    files: number;
    auth: number;
    other: number;
  };
  byAuth: {
    anonymous: number;
    api_key: number;
    session: number;
  };
  byMethod: {
    GET: number;
    POST: number;
    PUT: number;
    DELETE: number;
    other: number;
  };
}

export type ApiResource = keyof ApiUsageStats["byResource"];
export type ApiAuthVia = keyof ApiUsageStats["byAuth"];
export type ApiMethod = keyof ApiUsageStats["byMethod"];

export function emptyApiUsage(): ApiUsageStats {
  return {
    total: 0,
    rateLimited: 0,
    byResource: { clips: 0, files: 0, auth: 0, other: 0 },
    byAuth: { anonymous: 0, api_key: 0, session: 0 },
    byMethod: { GET: 0, POST: 0, PUT: 0, DELETE: 0, other: 0 },
  };
}

let current = emptyApiUsage();

export function classifyApiResource(path: string): ApiResource | null {
  if (path === "/api/health" || path.startsWith("/api/health/")) return null;
  if (path.startsWith("/api/v1/clips")) return "clips";
  if (path.startsWith("/api/v1/files")) return "files";
  if (path.startsWith("/api/v1/auth")) return "auth";
  if (path.startsWith("/api/")) return "other";
  return null;
}

export function classifyApiAuth(
  authorization: string | undefined,
  cookieHeader: string | undefined
): ApiAuthVia {
  if (authorization?.toLowerCase().startsWith("bearer ")) return "api_key";
  if (cookieHeader?.includes("webklip_session=")) return "session";
  return "anonymous";
}

export function classifyApiMethod(method: string): ApiMethod {
  const upper = method.toUpperCase();
  if (upper === "GET" || upper === "POST" || upper === "PUT" || upper === "DELETE") {
    return upper;
  }
  return "other";
}

export function recordApiUsage(event: {
  path: string;
  method: string;
  status: number;
  authorization?: string;
  cookie?: string;
}): void {
  const resource = classifyApiResource(event.path);
  if (resource === null) return;
  if (event.method.toUpperCase() === "OPTIONS") return;

  current.total += 1;
  current.byResource[resource] += 1;
  current.byAuth[classifyApiAuth(event.authorization, event.cookie)] += 1;
  current.byMethod[classifyApiMethod(event.method)] += 1;
  if (event.status === 429) current.rateLimited += 1;
}

export function peekApiUsage(): ApiUsageStats {
  return structuredClone(current);
}

/** Snapshot the current period and reset counters. */
export function takeApiUsageSnapshot(): ApiUsageStats {
  const snapshot = current;
  current = emptyApiUsage();
  return snapshot;
}

export function addApiUsage(a: ApiUsageStats, b: ApiUsageStats): ApiUsageStats {
  return {
    total: a.total + b.total,
    rateLimited: a.rateLimited + b.rateLimited,
    byResource: {
      clips: a.byResource.clips + b.byResource.clips,
      files: a.byResource.files + b.byResource.files,
      auth: a.byResource.auth + b.byResource.auth,
      other: a.byResource.other + b.byResource.other,
    },
    byAuth: {
      anonymous: a.byAuth.anonymous + b.byAuth.anonymous,
      api_key: a.byAuth.api_key + b.byAuth.api_key,
      session: a.byAuth.session + b.byAuth.session,
    },
    byMethod: {
      GET: a.byMethod.GET + b.byMethod.GET,
      POST: a.byMethod.POST + b.byMethod.POST,
      PUT: a.byMethod.PUT + b.byMethod.PUT,
      DELETE: a.byMethod.DELETE + b.byMethod.DELETE,
      other: a.byMethod.other + b.byMethod.other,
    },
  };
}
