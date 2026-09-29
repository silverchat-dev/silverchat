import { EXAMPLE } from "@/lib/example";

/**
 * The example print as real text: what screen readers get, what shows before WebGL loads or without it, and the
 * look the WebGL print develops towards. Sized in container units so it scales with the tray.
 */
export function PrintCard({ hidden = false }: { hidden?: boolean }) {
  return (
    <figure
      aria-label="Example poll print"
      className={`absolute top-1/2 left-1/2 w-[58%] -translate-x-1/2 -translate-y-1/2 -rotate-[1.2deg] bg-[url(/plates/paper.webp)] bg-cover px-[5cqw] py-[4.5cqw] text-developer transition-opacity duration-700 ${hidden ? "opacity-0" : ""}`}
      style={{ aspectRatio: "1134 / 977" }}
    >
      <p className="font-mono text-[1.5cqw] uppercase tracking-[0.18em] text-developer/70">Example</p>
      <p className="mt-[2.2cqw] text-[3.4cqw] leading-[1.15]">{EXAMPLE.question}</p>
      <ul className="mt-[3cqw] space-y-[1.4cqw]">
        {EXAMPLE.options.map((o, i) => (
          <li key={o.label} className="relative h-[4.4cqw] bg-developer/12">
            <span className={`absolute inset-y-0 left-0 ${i === 0 ? "bg-developer" : "bg-developer/60"}`} style={{ width: `${o.share}%` }} />
            <span className="absolute inset-0 flex items-center justify-between px-[1.4cqw] font-mono text-[1.7cqw] uppercase tracking-[0.12em]">
              <span className={i === 0 ? "text-paper" : "text-paper"}>{o.label}</span>
              <span className="text-developer">{o.share}%</span>
            </span>
          </li>
        ))}
      </ul>
      <figcaption className="mt-[3cqw] space-y-[0.4cqw] font-mono text-[1.6cqw] text-developer/80">
        <span className="block">{EXAMPLE.answers.toLocaleString("en-US")} signed answers</span>
        <span className="block">{EXAMPLE.zc.toLocaleString("en-US")} ZC paid</span>
      </figcaption>
    </figure>
  );
}
