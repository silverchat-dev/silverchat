import { OG, exampleCard } from "@/lib/og/print";
import { stopCard } from "@/lib/og/stop";

export const size = OG;
export const contentType = "image/png";
export const alt = "Silverchat: a stop on the walk through Meldan";

export default function Image() {
  return stopCard("riddle", exampleCard);
}
