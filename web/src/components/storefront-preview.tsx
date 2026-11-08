import { Icon } from "@/components/icons";
import { CATEGORIES } from "@/lib/api";
import { cn } from "@/lib/cn";

export type PreviewData = {
  name: string;
  category: string;
  venue: string;
  address: string;
  team: { name: string; title: string }[];
};

/** Initials for an avatar, from a display name. */
export function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join("") || "?"
  );
}

const tints = ["bg-mint-strong", "bg-[#f4e3d3]", "bg-[#e4e8f2]", "bg-[#f2e4e8]"];

/**
 * How the venue will look to customers, drawn from what the owner has typed so far.
 * It is a preview of their own data, never a sample venue.
 */
export function StorefrontPreview({ data, className }: { data: PreviewData; className?: string }) {
  const empty = (value: string, placeholder: string) =>
    value ? value : <span className="text-muted">{placeholder}</span>;
  return (
    <div className={cn("overflow-hidden rounded-[var(--radius-card)] bg-surface text-ink shadow-[var(--shadow-float)]", className)}>
      <div className="relative flex h-28 items-end bg-linear-to-br from-mint-strong via-mint to-[#f4e3d3] p-5">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-surface text-spruce shadow-[var(--shadow-card)]">
          <Icon name="store" width={26} height={26} />
        </span>
        <span className="absolute top-4 right-4 rounded-full bg-surface/90 px-3 py-1 text-xs font-semibold text-spruce">
          Pay at the venue
        </span>
      </div>
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-bold tracking-[var(--tracking-eyebrow)] text-spruce uppercase">
            {data.category ? CATEGORIES[data.category] : "Category"}
          </p>
          <p className="text-2xl leading-tight font-bold tracking-tight break-words">
            {empty(data.name, "Your business name")}
          </p>
          <p className="flex items-start gap-1.5 text-sm text-muted">
            <Icon name="pin" width={16} height={16} className="mt-0.5 shrink-0" />
            <span>
              {data.venue && <span className="font-semibold text-ink">{data.venue} · </span>}
              {data.address || "Your address"}
            </span>
          </p>
        </div>
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <p className="text-xs font-semibold text-muted">Book with</p>
          {data.team.length ? (
            <ul className="flex flex-wrap gap-3">
              {data.team.map((person, i) => (
                <li key={`${person.name}-${i}`} className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex size-9 items-center justify-center rounded-full text-sm font-bold",
                      tints[i % tints.length],
                    )}
                  >
                    {initials(person.name)}
                  </span>
                  <span className="flex flex-col leading-tight">
                    <span className="text-sm font-semibold">{person.name}</span>
                    {person.title && <span className="text-xs text-muted">{person.title}</span>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Your first team member</p>
          )}
        </div>
        <p className="rounded-[var(--radius-control)] bg-ground px-4 py-3 text-center text-sm font-semibold text-muted">
          Bookings open after approval
        </p>
      </div>
    </div>
  );
}
