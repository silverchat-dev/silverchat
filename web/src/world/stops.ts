/**
 * The walk, stop by stop: the one table the menu, the walk's sections, the camera, the sitemap and the routes all read.
 * A stop is a place in Meldan (a set and a camera pose in it) and the part of the site that lives there. Labels say
 * what you can do, not the product's name; the name comes second.
 */
import { ADDR, CASH_LIVE, ZERO, ZINC_LIVE } from "@/lib/config";

export type Stop = {
  id: string;
  /** the set the stop is in and the pose it is seen from */
  set: string;
  pose: string;
  /** the plain label and the product's own name */
  label: string;
  name: string;
  /** one line: what it is, for someone who has never been here */
  line: string;
  /** the routes that open at this stop; the first is where its Open link goes */
  routes: string[];
  /** a second way out of the same stop (the tunnel's fork) */
  also?: { label: string; name: string; route: string };
  /** false while the product behind the stop is not live: the stop shows closed */
  live: boolean;
};

export const STOPS: Stop[] = [
  {
    id: "gate",
    set: "hill",
    pose: "gate",
    label: "Enter Meldan",
    name: "The gate",
    line: "Silverchat is the polling network from Snowmoon. Walk in, or try it first with no wallet.",
    routes: ["/demo"],
    live: true,
  },
  {
    id: "pulse",
    set: "hill",
    pose: "pulse",
    label: "Answer today's questions",
    name: "Pulse",
    line: "Holders answer polls anonymously, with a signature and no gas, and earn for it.",
    routes: ["/pulse", "/poll", "/me", "/u"],
    live: true,
  },
  {
    id: "ask",
    set: "hill",
    pose: "ask",
    label: "Ask the network",
    name: "Ask",
    line: "Burn $ZC to ask a question. The more you burn, the more people are asked. The result goes on chain.",
    routes: ["/ask", "/stats", "/algorithm"],
    live: true,
  },
  {
    id: "predict",
    set: "bridge",
    pose: "predict",
    label: "Bet on what comes next",
    name: "Predict",
    line: "Seal a stake on YES or NO in $SC. Stakes open when the market closes; the bots keep score too.",
    routes: ["/predict", "/scores"],
    live: ADDR.predict !== ZERO,
  },
  {
    id: "realm",
    set: "market",
    pose: "realm",
    label: "Launch a token",
    name: "Realm",
    line: "Every token launched on Silverchat is a sign on this street. The brighter it burns, the more it trades.",
    routes: ["/realm"],
    live: ADDR.realmFactory !== ZERO,
  },
  {
    id: "fork",
    set: "tunnel",
    pose: "fork",
    label: "Go private",
    // each way of the fork shows only while its product is live
    name: CASH_LIVE ? "Cash" : "Zinc",
    line: CASH_LIVE
      ? ZINC_LIVE
        ? "Left: a private balance for $SC, $ZC and ETH. Right: pay for any AI with shielded ZEC."
        : "A private balance for $SC, $ZC and ETH."
      : "Pay for any AI model from shielded ZEC, with no account and no trail.",
    routes: CASH_LIVE ? ["/cash"] : ["/zinc"],
    also: CASH_LIVE && ZINC_LIVE ? { label: "Pay for AI privately", name: "Zinc", route: "/zinc" } : undefined,
    live: CASH_LIVE || ZINC_LIVE,
  },
  {
    id: "library",
    set: "library",
    pose: "library",
    label: "Read the record",
    name: "Records",
    line: "Every result ever fixed, the forecasters who called them, and the open API for your own agents.",
    routes: ["/records", "/docs"],
    live: true,
  },
  {
    id: "riddle",
    set: "pyramid",
    pose: "riddle",
    label: "Open the sealed door",
    name: "The riddle",
    line: "A riddle with a prize in $SC. Three have been solved; their names are on the wall.",
    routes: ["/riddle"],
    live: ADDR.riddle !== ZERO,
  },
];

/** The stop a route belongs to, by its first path segment; null for "/" (the walk itself). */
export function stopOf(pathname: string): Stop | null {
  if (pathname === "/") return null;
  const head = "/" + (pathname.split("/")[1] ?? "");
  return STOPS.find((s) => s.routes.includes(head) || s.also?.route === head) ?? STOPS[0];
}

export const stopIndex = (id: string) => Math.max(0, STOPS.findIndex((s) => s.id === id));
