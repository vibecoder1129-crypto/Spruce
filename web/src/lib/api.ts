/**
 * Browser-side API client. Calls go to /api/* on this origin, which Next rewrites to the
 * FastAPI service, so session cookies stay first-party and httpOnly.
 *
 * - Every state-changing call carries the CSRF token (double-submit cookie).
 * - A 401 triggers one token refresh and a retry. Refreshes are single-flight: parallel
 *   requests share one refresh, because the API treats a reused refresh token as theft.
 */

export type Me = {
  id: string;
  email: string;
  role: "consumer" | "owner" | "staff" | "admin";
  email_verified: boolean;
  mfa_enabled: boolean;
  mfa_pending: boolean;
  timezone: string;
  language: string;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const CSRF_COOKIES = ["__Host-sp_csrf", "sp_csrf"];
let refreshing: Promise<boolean> | null = null;

function readCookie(names: string[]): string | null {
  for (const part of document.cookie.split("; ")) {
    const [key, ...rest] = part.split("=");
    if (names.includes(key)) return decodeURIComponent(rest.join("="));
  }
  return null;
}

async function csrfToken(): Promise<string> {
  const existing = readCookie(CSRF_COOKIES);
  if (existing) return existing;
  const res = await fetch("/api/auth/csrf", { credentials: "same-origin" });
  return ((await res.json()) as { csrf_token: string }).csrf_token;
}

async function refreshOnce(): Promise<boolean> {
  refreshing ??= (async () => {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "same-origin",
      headers: { "x-csrf-token": await csrfToken() },
    });
    return res.ok;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

function messageFrom(body: unknown, status: number): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    // FastAPI validation errors: show the first, in plain words.
    const first = detail[0] as { msg?: string } | undefined;
    if (first?.msg) return first.msg.replace(/^Value error, /, "");
  }
  return status >= 500 ? "Something went wrong on our side. Please try again." : "That didn't work.";
}

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
  retry = true,
): Promise<T> {
  const method = init.method ?? "GET";
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (method !== "GET") headers["x-csrf-token"] = await csrfToken();

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    credentials: "same-origin",
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  if (res.status === 401 && retry && !path.startsWith("/auth/")) {
    if (await refreshOnce()) return api<T>(path, init, false);
  }
  if (res.status === 204 || res.status === 202) return undefined as T;
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, messageFrom(body, res.status));
  return body as T;
}

/** Where a signed-in person should land next, given their account state. */
export function nextStep(me: Me): string {
  if (me.mfa_pending) return me.mfa_enabled ? "/login/verify" : "/account/security";
  return "/account";
}
