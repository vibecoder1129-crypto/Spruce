import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

export function Card({ className, ...rest }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-[var(--shadow-card)]",
        className,
      )}
      {...rest}
    />
  );
}
