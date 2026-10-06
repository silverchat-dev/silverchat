import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { WORLD_LIVE } from "@/lib/config";
import { STOPS, stopIndex } from "@/world/stops";

import { OG } from "./print";

const INK = "#1d1914";
const PAPER = "#f2ead9";
const SOFT = "#6e6455";

const fonts = Promise.all(
  ["LibreCaslonText-Regular.ttf", "JetBrainsMono-Regular.ttf"].map((f) => readFile(join(process.cwd(), "src/lib/og", f))),
);

/** A stop's share card: the place in Meldan, and a slip of journal paper with its number, label and line. */
export async function stopCard(id: string, fallback: () => Promise<ImageResponse> | ImageResponse) {
  // the old site keeps its own card until the walk goes live
  if (!WORLD_LIVE) return fallback();
  const stop = STOPS[stopIndex(id)];
  const [[serif, mono], still] = await Promise.all([fonts, readFile(join(process.cwd(), "src/lib/og/stills", `${stop.id}.jpg`))]);
  const n = String(stopIndex(id) + 1).padStart(2, "0");
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", position: "relative" }}>
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img src={`data:image/jpeg;base64,${still.toString("base64")}`} width={OG.width} height={OG.height} style={{ position: "absolute", inset: 0 }} />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            position: "absolute",
            // stills keep their subject left of centre (the panel's side is right); the gate's stands on the right
            ...(id === "gate" ? { left: 56 } : { right: 56 }),
            bottom: 56,
            width: 600,
            background: PAPER,
            color: INK,
            padding: "34px 40px 32px",
            borderRadius: 18,
            boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
          }}
        >
          <div style={{ fontFamily: "mono", fontSize: 17, letterSpacing: 3, color: SOFT, textTransform: "uppercase" }}>
            {`No. ${n} · ${stop.name} · silverchat`}
          </div>
          <div style={{ fontFamily: "serif", fontSize: 54, lineHeight: 1.04, marginTop: 14 }}>{id === "gate" ? "A day in Meldan." : stop.label}</div>
          <div style={{ fontFamily: "serif", fontSize: 23, lineHeight: 1.35, color: SOFT, marginTop: 14 }}>{stop.line}</div>
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
