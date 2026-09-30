import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

export const OG = { width: 1200, height: 630 };

const INK = "#141312";
const PAPER = "#E9E4DA";
const SILVER = "#A7A9AC";

const fonts = Promise.all(
  ["LibreCaslonText-Regular.ttf", "JetBrainsMono-Regular.ttf"].map((f) => readFile(join(process.cwd(), "src/lib/og", f))),
);

/**
 * A share card: the poll as a print lying on the dark bench, the same print the site shows. `options` are shares in
 * percent, or null while the poll is open and its count is not out yet.
 */
export async function printCard({ kicker, question, options, foot }: { kicker: string; question: string; options: [string, number][] | null; foot: string }) {
  const [serif, mono] = await fonts;
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: INK, padding: "56px 64px", alignItems: "center", gap: 56 }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: 720,
            minHeight: 480,
            background: PAPER,
            color: INK,
            padding: "44px 52px",
            transform: "rotate(-1.2deg)",
          }}
        >
          <div style={{ fontFamily: "mono", fontSize: 18, letterSpacing: 3, opacity: 0.65, textTransform: "uppercase" }}>{kicker}</div>
          <div style={{ fontFamily: "serif", fontSize: question.length > 120 ? 32 : question.length > 70 ? 40 : 50, lineHeight: 1.12, marginTop: 20 }}>{question}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 30 }}>
            {(options ?? []).slice(0, 4).map(([label, share], i) => (
              <div key={label} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "mono", fontSize: 20, textTransform: "uppercase" }}>
                  <span>{label.length > 36 ? `${label.slice(0, 35)}…` : label}</span>
                  <span>{share}%</span>
                </div>
                <div style={{ display: "flex", height: 14, background: "rgba(20,19,18,0.12)" }}>
                  <div style={{ width: `${share}%`, background: i ? "rgba(20,19,18,0.6)" : INK }} />
                </div>
              </div>
            ))}
          </div>
          {options && options.length > 4 && (
            <div style={{ fontFamily: "mono", fontSize: 18, opacity: 0.6, marginTop: 10 }}>+ {options.length - 4} more</div>
          )}
          <div style={{ fontFamily: "mono", fontSize: 18, opacity: 0.75, marginTop: "auto", paddingTop: 26 }}>{foot}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, color: PAPER, gap: 18 }}>
          <div style={{ fontFamily: "serif", fontSize: 48, lineHeight: 1.05 }}>Ask the network.</div>
          <div style={{ fontFamily: "serif", fontSize: 26, lineHeight: 1.3, color: SILVER }}>The polling network from Snowmoon, ch.&nbsp;27. Now on Ethereum.</div>
          <div style={{ fontFamily: "mono", fontSize: 20, letterSpacing: 2, marginTop: 20 }}>silverchat.cash</div>
        </div>
      </div>
    ),
    {
      ...OG,
      fonts: [
        { name: "serif", data: serif, weight: 400, style: "normal" },
        { name: "mono", data: mono, weight: 400, style: "normal" },
      ],
    },
  );
}
