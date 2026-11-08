import { cn } from "@/lib/cn";

/**
 * Line drawing of a spruce sprig, generated from a few numbers so it stays a few hundred
 * bytes of SVG instead of an image. Purely decorative.
 */
function sprig(x0: number, y0: number, length: number, lean: number, needles: number) {
  const stem = `M${x0} ${y0} q ${lean} ${-length / 2} ${lean * 0.6} ${-length}`;
  const out: string[] = [stem];
  for (let i = 1; i <= needles; i++) {
    const t = i / (needles + 1);
    // Point on the quadratic stem (approximation is fine for line art).
    const x = x0 + 2 * (1 - t) * t * lean + t * t * lean * 0.6;
    const y = y0 - length * t;
    const size = 26 * (1 - t * 0.55);
    out.push(`M${x.toFixed(1)} ${y.toFixed(1)} l ${-size} ${-size * 0.55}`);
    out.push(`M${x.toFixed(1)} ${y.toFixed(1)} l ${size} ${-size * 0.55}`);
  }
  return out.join(" ");
}

const paths = [
  sprig(160, 520, 470, 30, 16),
  sprig(70, 520, 300, -20, 10),
  sprig(250, 520, 260, 26, 9),
];

export function Botanical({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 320 520"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={cn("pointer-events-none", className)}
    >
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          stroke="currentColor"
          strokeWidth={i === 0 ? 1.6 : 1.2}
          strokeLinecap="round"
          opacity={i === 0 ? 1 : 0.6}
        />
      ))}
    </svg>
  );
}
