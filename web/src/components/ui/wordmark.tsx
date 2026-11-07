import { cn } from "@/lib/cn";

/** The split SPR/UCE wordmark. Screen readers hear "Spruce", not two fragments. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn("text-xl tracking-[var(--tracking-wordmark)] select-none", className)}
      role="img"
      aria-label="Spruce"
    >
      <span aria-hidden="true" className="font-bold text-ink">
        SPR
      </span>
      <span aria-hidden="true" className="font-medium text-spruce">
        UCE
      </span>
    </span>
  );
}
