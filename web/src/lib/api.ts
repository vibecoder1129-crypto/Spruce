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

export type ApprovalStatus = "pending" | "approved" | "rejected" | "suspended";

export type Business = {
  id: string;
  name: string;
  category: string;
  approval_status: ApprovalStatus;
  rejection_reason: string | null;
  rejection_note: string | null;
  submitted_at: string | null;
};

export type AdminBusiness = Business & { location_count: number; staff_count: number };

export type Place = {
  id: string;
  name: string;
  address_text: string;
  latitude: number;
  longitude: number;
  timezone: string;
};

export type Staff = {
  id: string;
  display_name: string;
  title: string;
  location_id: string;
  has_login: boolean;
  active: boolean;
  service_ids: string[];
};

export type Service = {
  id: string;
  name: string;
  category: string;
  duration_minutes: number;
  price_minor: number;
  currency: string;
  active: boolean;
};

export type Flag =
  | "calendar.view"
  | "calendar.team"
  | "appointments.own"
  | "checkout.own"
  | "reports.own"
  | "chat.personal";

export type Permission = { flag: Flag; granted: boolean };

export type MyStaff = {
  id: string;
  display_name: string;
  title: string;
  business_name: string;
  location_name: string;
  services: string[];
  permissions: Flag[];
};

/** HLD 9: what each grantable permission lets an employee do, in the owner's words. */
export const FLAGS: Record<Flag, { label: string; meaning: string }> = {
  "calendar.view": { label: "See the calendar", meaning: "Their own column on the day board." },
  "calendar.team": { label: "See the whole team's calendar", meaning: "Everyone's columns, not just their own." },
  "appointments.own": {
    label: "Manage their own appointments",
    meaning: "Book, move and cancel on their own column, including walk-ins.",
  },
  "checkout.own": {
    label: "Check out their own visits",
    meaning: "Mark visits done or no-show and record cash or card.",
  },
  "reports.own": { label: "See their own numbers", meaning: "Reports for their own work only." },
  "chat.personal": { label: "Reply to their own messages", meaning: "Answer customers who message them directly." },
};

/** HLD 9: rights that stay with the owner, whatever the employee's title. */
export const OWNER_ONLY = [
  "Give or take away permissions",
  "Change the business profile, locations and tax",
  "Answer the business inbox",
  "Plan the weekly shifts",
];

/** A price in minor units, shown the way people in Europe read it. */
export function formatPrice(minor: number, currency: string): string {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency }).format(minor / 100);
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h && `${h} h`, m && `${m} min`].filter(Boolean).join(" ");
}

export type AdminBusinessDetail = Business & { locations: Place[]; staff: Staff[] };

export type Country = { code: string; name: string; timezones: string[] };

export const CATEGORIES: Record<string, string> = {
  hair: "Hair salon",
  barber: "Barber",
  nails: "Nails",
  brows_lashes: "Brows and lashes",
  makeup: "Makeup",
  skin: "Skin care",
  massage: "Massage",
  spa: "Spa",
  wellness: "Wellness",
};

/** HLD 6: why an admin can turn a business down. */
export const REJECT_REASONS: Record<string, string> = {
  invalid_documents: "Documents aren't valid",
  incomplete_profile: "Profile is incomplete",
  duplicate_listing: "Duplicate listing",
  category_not_supported: "Category isn't supported",
  suspicious_info: "Information looks suspicious",
  out_of_launch_area: "Outside the launch area",
  policy_violation: "Breaks our policies",
  other: "Other",
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
  if (me.role === "owner") return "/dashboard"; // The dashboard sends new owners on to onboarding.
  if (me.role === "admin") return "/admin/businesses";
  if (me.role === "staff") return "/staff";
  return "/account";
}
