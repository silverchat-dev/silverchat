import type { CSSProperties } from "react";

import { EXAMPLE } from "@/lib/example";

// how long each mark takes to come up: dark ones quickly, pale ones slowly (seconds, the same curve as the WebGL print)
const tau = (s: number) => ({ "--tau": `${s}s` }) as CSSProperties;

/**
 * The example print as real text: what screen readers get, what shows before WebGL loads or without it, and the
 * look the WebGL print develops towards. Sized in container units so it scales with the tray.
 */
export function PrintCard() {
  return (
    <figure
      aria-label="Example poll print"
      className="absolute top-1/2 left-1/2 w-[58%] -translate-x-1/2 -translate-y-1/2 -rotate-[1.2deg] bg-[url(/plates/paper.webp)] bg-cover px-[5cqw] py-[4.5cqw] text-developer"
      style={{ aspectRatio: "1134 / 977" }}
    >
      <p className="develop font-mono text-[1.5cqw] uppercase tracking-[0.18em] text-developer/70" style={tau(1.7)}>
        Example
      </p>
      <p className="develop mt-[2.2cqw] text-[3.4cqw] leading-[1.15]" style={tau(1.2)}>
        {EXAMPLE.question}
      </p>
      <ul className="mt-[3cqw] space-y-[1.4cqw]">
        {EXAMPLE.options.map((o, i) => (
          <li key={o.label} className="relative h-[4.4cqw]">
            <span className="develop absolute inset-0 bg-developer/12" style={tau(3.4)} />
            <span
              className={`develop absolute inset-y-0 left-0 ${i === 0 ? "bg-developer" : "bg-developer/60"}`}
              style={{ width: `${o.share}%`, ...tau(i === 0 ? 1.2 : 2) }}
            />
            <span className="absolute inset-0 flex items-center justify-between px-[1.4cqw] font-mono text-[1.7cqw] uppercase tracking-[0.12em]">
              <span className="develop text-paper" style={tau(i === 0 ? 1.2 : 2)}>
                {o.label}
              </span>
              <span className="develop text-developer" style={tau(1.2)}>
                {o.share}%
              </span>
            </span>
          </li>
        ))}
      </ul>
      <figcaption className="develop mt-[3cqw] font-mono text-[1.6cqw] text-developer/80" style={tau(1.5)}>
        {EXAMPLE.answers.toLocaleString("en-US")} signed answers
      </figcaption>
    </figure>
  );
}
