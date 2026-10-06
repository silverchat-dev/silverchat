"use client";

/**
 * What the site knows, turned into what Meldan shows: the newest fixed result over the round room, the Realm board's
 * busiest tokens as signs on Hun Min street, the open markets on the tower, the riddle's state at the door. Read
 * from the site's own APIs once a minute; a place looks complete without any of it.
 */
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";

import type { Live } from "./sets/types";

const COLOURS = ["#f2c14e", "#7fc8f8", "#f78c6b", "#b8a1e8", "#8fd694", "#f2a6c8"];
const get = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const opts = { staleTime: 60_000, refetchInterval: 60_000 } as const;

// a sign carries a symbol, nothing else: letters and digits, upper case, at most 8 (user text never reaches the city raw)
const sign = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);

export function useLive(): Live {
  const polls = useQuery({ queryKey: ["world", "final"], queryFn: () => get("/api/polls?status=final&limit=1"), ...opts });
  const realm = useQuery({ queryKey: ["world", "realm"], queryFn: () => get("/api/realm?sort=trending"), ...opts });
  const markets = useQuery({ queryKey: ["world", "markets"], queryFn: () => get("/api/markets"), ...opts });
  const riddle = useQuery({ queryKey: ["world", "riddle"], queryFn: () => get("/api/riddle"), ...opts });
  const roof = useRef(0);
  const burst = useRef(0);

  // a question just paid for: the bowl in the round room flares for a moment (see burstBowl)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const flare = () => {
      burst.current = 1;
      clearTimeout(timer);
      timer = setTimeout(() => (burst.current = 0), 2500);
    };
    addEventListener("meldan:burst", flare);
    return () => (removeEventListener("meldan:burst", flare), clearTimeout(timer));
  }, []);

  return useMemo(() => {
    const live: Omit<Live, "roof" | "burst"> = {};
    const totals: number[] | undefined = polls.data?.polls?.[0]?.tally?.totals?.[0];
    if (totals && totals.some((n) => n > 0)) live.result = { shares: totals, colours: COLOURS };
    const tokens = (realm.data?.tokens ?? []) as { symbol: string | null; volume24hUsd: number; hidden?: boolean }[];
    const signs = tokens
      .filter((t) => !t.hidden && sign(t.symbol))
      .slice(0, 24)
      .map((t) => ({ symbol: sign(t.symbol), volume: Number(t.volume24hUsd) || 0 }));
    if (signs.length) live.tokens = signs;
    // stakes are sealed until a market closes: an open market shows how many stakes it has, not which side they took
    const open = ((markets.data?.markets ?? []) as { title: string | null; status: string; stakes: number; yes: string | null; no: string | null }[])
      .filter((m) => m.title)
      .slice(0, 6)
      .map((m) => {
        const y = Number(m.yes ?? 0);
        const n = Number(m.no ?? 0);
        return { question: (m.title ?? "").slice(0, 60), yes: y + n > 0 ? y / (y + n) : 0.5 };
      });
    if (open.length) live.markets = open;
    const r = riddle.data as { state: "open" | "solved" | "closed"; solved: string[] } | null | undefined;
    if (r?.state) live.riddle = { state: r.state, solved: r.solved.map((t) => t.slice(0, 24)) };
    return { ...live, roof, burst };
  }, [polls.data, realm.data, markets.data, riddle.data]);
}

/** Called by the Ask form once a question's burn is confirmed: the bowl behind the panel flares. */
export const burstBowl = () => dispatchEvent(new Event("meldan:burst"));
