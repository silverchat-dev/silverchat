import { EXAMPLE_NEGATIVES } from "@/lib/example";

// the four full frame windows of the strip plate, in % of its height; the partial window above them is cut off
const TOP = 13.8;
const FRAMES = [
  [14.6, 34.9],
  [36.3, 56.6],
  [57.9, 76.3],
  [78.4, 97.2],
];

/** A strip of negatives: past polls, printed in reverse. Examples until real records exist. */
export function Negatives() {
  return (
    <div className="relative mx-auto w-full max-w-[11rem]">
      <p className="mb-2 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-silver">Example records</p>
      <div className="max-h-[min(30rem,48vh)] overflow-hidden [mask-image:linear-gradient(to_bottom,black_80%,transparent)]">
        <div
          className="@container relative bg-[url(/plates/negatives.webp)] bg-contain bg-top bg-no-repeat"
          style={{ aspectRatio: "456 / 1536", marginTop: `${(-TOP * 1536) / 456}%` }}
        >
          {EXAMPLE_NEGATIVES.map((n, i) => (
            <div
              key={n.block}
              aria-hidden
              className="absolute left-[19%] right-[19%] flex flex-col justify-between p-[5cqw]"
              style={{ top: `${FRAMES[i][0] + 1}%`, height: `${FRAMES[i][1] - FRAMES[i][0] - 2}%` }}
            >
              <span className="font-mono text-[6.5cqw] text-paper/70">#{n.block.toLocaleString("en-US")}</span>
              <span className="line-clamp-2 text-[6.2cqw] leading-tight break-words text-paper/85">{n.question}</span>
              <span className="space-y-[2cqw] font-mono text-[5.5cqw] text-paper/60">
                {[
                  ["YES", n.yes],
                  ["NO", 100 - n.yes],
                ].map(([k, v]) => (
                  <span key={k} className="flex items-center gap-[3cqw]">
                    <span className="w-[14cqw]">{k}</span>
                    <span className="h-[3cqw] flex-1 bg-paper/10">
                      <span className="block h-full bg-paper/55" style={{ width: `${v}%` }} />
                    </span>
                    <span className="w-[10cqw] text-right tabular-nums">{v}</span>
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
