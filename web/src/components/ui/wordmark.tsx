import { brand } from "@/brand";
import { cn } from "@/lib/cn";

/** The split wordmark. Screen readers hear the name, not two fragments. */
export function Wordmark({ className, tone = "dark" }: { className?: string; tone?: "dark" | "light" }) {
  return (
    <span
      className={cn("text-xl tracking-[var(--tracking-wordmark)] select-none", className)}
      role="img"
      aria-label={brand.name}
    >
      <span aria-hidden="true" className={cn("font-bold", tone === "dark" ? "text-ink" : "text-white")}>
        {brand.wordmark[0]}
      </span>
      <span aria-hidden="true" className={cn("font-medium", tone === "dark" ? "text-spruce" : "text-wordmark-light")}>
        {brand.wordmark[1]}
      </span>
    </span>
  );
}
