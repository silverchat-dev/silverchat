import { NextResponse } from "next/server";

import { ADDR, ZERO } from "@/lib/config";
import { SOLVED, live, read } from "@/lib/server/riddle";

// the door in Meldan reads this: whether the riddle is open, solved or closed, and the solved ones' titles, oldest first
export const revalidate = 60;

export async function GET() {
  const titles = SOLVED.map((e) => e.title).reverse();
  if (ADDR.riddle === ZERO) return NextResponse.json({ state: "closed", solved: titles });
  const r = await read().catch(() => null);
  if (!r) return NextResponse.json({ state: "closed", solved: titles });
  const here = SOLVED.find((e) => e.address.toLowerCase() === ADDR.riddle.toLowerCase());
  // the live riddle joins the wall once it is solved (its title is on the server only)
  const title = live()?.title;
  if (r.solved && !here && title) titles.push(title);
  return NextResponse.json({ state: r.solved ? "solved" : r.closed ? "closed" : "open", solved: titles });
}
