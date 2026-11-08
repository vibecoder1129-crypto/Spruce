import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

type Tone = "neutral" | "spruce" | "warn" | "danger";

const tones: Record<Tone, string> = {
  neutral: "bg-ground text-muted border-line",
  spruce: "bg-mint-strong text-spruce border-transparent",
  warn: "bg-warn-soft text-ink border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
};

/** Small status label. Colour is never the only signal: the text always says the status. */
export function Badge({
  tone = "neutral",
  className,
  ...rest
}: ComponentProps<"span"> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        tones[tone],
        className,
      )}
      {...rest}
    />
  );
}
