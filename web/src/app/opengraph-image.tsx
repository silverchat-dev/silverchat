import { OG, exampleCard } from "@/lib/og/print";
import { stopCard } from "@/lib/og/stop";

export const size = OG;
export const contentType = "image/png";
export const alt = "Silverchat: ask the network, watch the answer develop";

export default function Image() {
  return stopCard("gate", exampleCard);
}
