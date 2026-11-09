/**
 * One colour per team member, so a busy board reads at a glance. Each accent passes 4.5:1 for
 * white initials on it and for itself on its tint; names on the tint use ink (13:1 or more).
 * Twelve colours, then they repeat; names and initials still tell people apart.
 */
export const PALETTE = [
  { accent: "#2f6b4f", tint: "#e3efe8" },
  { accent: "#a84529", tint: "#f8e6df" },
  { accent: "#4757a8", tint: "#e6e9f7" },
  { accent: "#8a4a87", tint: "#f4e6f3" },
  { accent: "#8c6410", tint: "#f7eed8" },
  { accent: "#1d6f75", tint: "#ddeff0" },
  { accent: "#a83d64", tint: "#f8e3ea" },
  { accent: "#5f6d17", tint: "#eef0d9" },
  { accent: "#36648f", tint: "#e2ecf5" },
  { accent: "#82523a", tint: "#f1e7df" },
  { accent: "#6249a8", tint: "#ebe6f7" },
  { accent: "#3a7036", tint: "#e3f0e1" },
] as const;

export type StaffColor = (typeof PALETTE)[number];

/** Colours by position in the location's team, which the API returns in a stable order. */
export function staffColors(staff: { id: string }[]): Map<string, StaffColor> {
  return new Map(staff.map((s, i) => [s.id, PALETTE[i % PALETTE.length]]));
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase() || "?";
}
