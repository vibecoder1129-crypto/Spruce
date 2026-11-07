import { brand } from "@/brand";
import { cn } from "@/lib/cn";

/** The split wordmark. Screen readers hear the name, not two fragments. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn("text-xl tracking-[var(--tracking-wordmark)] select-none", className)}
      role="img"
      aria-label={brand.name}
    >
      <span aria-hidden="true" className="font-bold text-ink">
        {brand.wordmark[0]}
      </span>
      <span aria-hidden="true" className="font-medium text-spruce">
        {brand.wordmark[1]}
      </span>
    </span>
  );
}
