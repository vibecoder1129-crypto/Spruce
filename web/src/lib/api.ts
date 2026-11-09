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
  /** A platform admin is helping as this owner. */
  support?: boolean;
  rebook_reminders?: boolean;
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
  cancel_window_hours: number;
  support_until: string | null;
};

export type SupportState = { until: string | null; log: { at: string; method: string; path: string; by: string }[] };

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
  rebook_weeks: number;
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
  business_id: string;
  display_name: string;
  title: string;
  business_name: string;
  location_name: string;
  services: string[];
  permissions: Flag[];
};

/** One staff member's hours on one day of a dated week. Times are "HH:MM" at the location. */
export type Shift = { staff_id: string; day: number; starts: string; ends: string };

export type TimeOff = { id: string; staff_id: string; starts_at: string; ends_at: string; reason: string };

export type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled" | "no_show";

export type Booking = {
  id: string;
  staff_id: string;
  service_id: string;
  service_name: string;
  client_name: string;
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  source: "consumer" | "owner";
  price_minor: number;
  currency: string;
  client_flags: ("risk" | "regular")[];
};

export type BookingDetail = Booking & { guest_phone: string | null; guest_email: string | null; notes: string };

export type BookableService = {
  id: string;
  name: string;
  duration_minutes: number;
  price_minor: number;
  currency: string;
  staff_ids: string[];
};

export type DayBoard = {
  date: string;
  location_id: string;
  timezone: string;
  locations: { id: string; name: string }[];
  staff: { id: string; display_name: string; title: string; shift: { starts: string; ends: string } | null }[];
  bookings: Booking[];
  time_off: TimeOff[];
  services: BookableService[];
  can_block_time: boolean;
  can_book_staff_ids: string[];
  can_mark_staff_ids: string[];
};

export type WeekBoard = {
  week: string;
  timezone: string;
  staff: { id: string; display_name: string; title: string };
  days: { date: string; shift: { starts: string; ends: string } | null }[];
  bookings: Booking[];
  time_off: TimeOff[];
};

/** "YYYY-MM-DD" for a calendar date, without time zone surprises. */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** A "YYYY-MM-DD" string as a local Date at noon, so adding days never crosses a clock change. */
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

export function addDays(iso: string, days: number): string {
  const d = parseDate(iso);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

/** The Monday of the week holding this date. */
export function mondayOf(iso: string): string {
  return addDays(iso, -((parseDate(iso).getDay() + 6) % 7));
}

/** Minutes after local midnight of an instant, in the location's time zone. */
export function minutesAt(instant: string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(instant))
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return Number(parts.hour) * 60 + Number(parts.minute);
}

/** The "YYYY-MM-DD" date of an instant in the location's time zone. */
export function dayAt(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(instant),
  );
}

/** "HH:MM" for a number of minutes after midnight. */
export function clock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export type SearchResult = {
  business_id: string;
  business_name: string;
  category: string;
  location_id: string;
  location_name: string;
  city: string;
  country_code: string;
  address_text: string;
  latitude: number;
  longitude: number;
  distance_km: number | null;
  from_price_minor: number;
  currency: string;
};

export type SearchPage = { results: SearchResult[]; page: number; has_more: boolean };

export type City = { country_code: string; city: string; count: number };

export type Storefront = {
  id: string;
  name: string;
  category: string;
  locations: {
    id: string;
    name: string;
    address_text: string;
    latitude: number;
    longitude: number;
    timezone: string;
    hours: { day: number; opens: string | null; closes: string | null }[];
  }[];
  services: {
    id: string;
    name: string;
    category: string;
    duration_minutes: number;
    price_minor: number;
    currency: string;
    staff_ids: string[];
  }[];
  team: { id: string; display_name: string; title: string }[];
  cancel_window_hours: number;
};

export type Availability = { date: string; timezone: string; slots: { staff_id: string; time: string }[] };

export type MyBooking = {
  id: string;
  business_id: string;
  business_name: string;
  location_name: string;
  address: string;
  service_id: string;
  service_name: string;
  staff_id: string;
  staff_name: string;
  start: string; // venue wall-clock "YYYY-MM-DDTHH:MM"
  end: string;
  timezone: string;
  status: BookingStatus;
  price_minor: number;
  currency: string;
  can_change: boolean;
  cancel_window_hours: number;
};

export type MyBookings = { upcoming: MyBooking[]; past: MyBooking[] };

export type WaitlistEntry = {
  id: string;
  business_id: string;
  business_name: string;
  service_id: string;
  service_name: string;
  date: string;
  notified: boolean;
};

export type Waiting = { id: string; name: string; service_name: string; joined_at: string; notified: boolean };

/** A same-site path to return to after signing in, or null. Never another origin. */
export function safeNext(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  return value;
}

export type Favorite = { business_id: string; business_name: string; category: string; city: string; saved_at: string };

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
  return "/bookings";
}

export type Client = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string;
  source: "imported" | "added";
  created_at: string;
};

export type ImportResult = { total: number; added: number; duplicates: number; invalid: { row: number; reason: string }[] };
