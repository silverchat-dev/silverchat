"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useAccount } from "wagmi";

import type { Tally } from "@/lib/algorithm";
import { receiptIds } from "@/lib/answer";
import { topicOf, type Content } from "@/lib/content";
import { lead, span } from "@/lib/format";
import { isNew, parse, saveSeen, savedRaw, seenRaw, setSaved, stateOf, subscribe, type State } from "@/lib/you";

type Poll = {
  id: string;
  content: Content | null;
  hidden: boolean;
  asker: string;
  status: "open" | "final" | "refunded";
  closesAt: number;
  tally: Tally | null;
};

/**
 * Every poll from the open export, shared by the header and /me. The wallet's own polls are picked out here in the
 * browser, so no request ever names the polls a wallet answered. The export grows with the poll count; a narrower
 * endpoint is due when it gets heavy.
 */
function useAllPolls(enabled: boolean) {
  return useQuery({
    queryKey: ["export"],
    enabled,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: async (): Promise<Poll[]> => {
      const res = await fetch("/api/export");
      // a refused read must not look like an empty record, or leaving /me would store "nothing seen"
      if (!res.ok) throw new Error(res.statusText);
      return (await res.json()).polls ?? [];
    },
  });
}

/** `now` is when the export was read, so a render never reads the clock. */
function useYours(address: string | undefined, all: Poll[] | undefined, now: number) {
  const savedText = useSyncExternalStore(subscribe, savedRaw, () => null);
  return useMemo(() => {
    if (!all) return null;
    const byId = new Map(all.map((p) => [p.id, p]));
    const saved = parse<string[]>(savedText, [])
      .map((id) => byId.get(id))
      .filter((p): p is Poll => !!p);
    if (!address) return { asked: [], answered: [], saved, states: {} as Record<string, State> };
    const me = address.toLowerCase();
    const answered = new Set(receiptIds(me));
    const asked = all.filter((p) => p.asker.toLowerCase() === me);
    const mine = all.filter((p) => answered.has(p.id) && p.asker.toLowerCase() !== me);
    const states = Object.fromEntries([...asked, ...mine, ...saved].map((p) => [p.id, stateOf(p, now)])) as Record<string, State>;
    return { asked, answered: mine, saved, states };
  }, [address, all, now, savedText]);
}

/** The statuses stored at the end of the last visit to /me, null before the first one. */
function useSeen(address: string | undefined) {
  const text = useSyncExternalStore(subscribe, () => (address ? seenRaw(address) : null), () => null);
  return useMemo(() => parse<Record<string, State> | null>(text, null), [text]);
}

/** "You" in the nav, with a mark when one of your polls closed, was fixed or was refunded since your last visit. */
export function YouLink({ className }: { className: string }) {
  const path = usePathname();
  const { address } = useAccount();
  const all = useAllPolls(!!address);
  const yours = useYours(address, all.data, all.dataUpdatedAt / 1000);
  const seen = useSeen(address);
  const here = path === "/me";
  const fresh = !here && !!yours && Object.entries(yours.states).some(([id, s]) => isNew(seen, id, s));

  return (
    <Link href="/me" aria-current={here ? "page" : undefined} className={className}>
      You
      {fresh && (
        <>
          <span aria-hidden className="ml-1.5 inline-block size-1.5 bg-paper align-middle" />
          <span className="sr-only"> · new results</span>
        </>
      )}
    </Link>
  );
}

export function YouPage() {
  const { address, isReconnecting } = useAccount();
  const all = useAllPolls(true);
  const now = all.dataUpdatedAt / 1000;
  const yours = useYours(address, all.data, now);
  const seen = useSeen(address);
  const loading = all.isPending || isReconnecting;

  // what you saw is stored when you leave, so the marks stay for the whole visit
  const latest = useRef(yours?.states);
  useEffect(() => {
    latest.current = yours?.states;
  });
  useEffect(() => {
    if (!address) return;
    const store = () => latest.current && saveSeen(address, latest.current);
    window.addEventListener("pagehide", store);
    return () => {
      window.removeEventListener("pagehide", store);
      store();
    };
  }, [address]);

  return (
    <div className="space-y-14">
      {all.isError && !all.data && <p className="font-mono text-sm text-silver">Could not read the record. Try again in a minute.</p>}
      {isReconnecting ? null : !address ? (
        <div className="space-y-4">
          <p className="text-xl text-paper/80">Connect a wallet to see the polls you asked and answered.</p>
          <ConnectButton />
        </div>
      ) : (
        <>
          <List title="Asked by you" polls={yours?.asked} seen={seen} now={now} empty="You have not asked a question with this wallet yet." loading={loading} />
          <List
            title="Answered on this device"
            polls={yours?.answered}
            seen={seen}
            now={now}
            empty="No answers from this wallet on this device. Answers you gave on another device are listed on that device."
            loading={loading}
          />
        </>
      )}
      <List title="Saved" polls={yours?.saved} seen={seen} now={now} empty="Nothing saved. Save a poll from its page to keep it here." loading={loading} />
    </div>
  );
}

type ListProps = { title: string; polls: Poll[] | undefined; seen: Record<string, State> | null; now: number; empty: string; loading: boolean };

function List({ title, polls, seen, now, empty, loading }: ListProps) {
  return (
    <section className="space-y-4">
      <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-silver">
        {title}
        {polls?.length ? ` · ${polls.length}` : ""}
      </h2>
      {loading ? (
        <p className="font-mono text-sm text-silver">Reading the record…</p>
      ) : polls?.length ? (
        <ol className="divide-y divide-silver/20 border-y border-silver/20">
          {polls.map((p) => (
            <Row key={p.id} poll={p} now={now} fresh={isNew(seen, p.id, stateOf(p, now))} />
          ))}
        </ol>
      ) : (
        <p className="text-lg text-paper/70">{empty}</p>
      )}
    </section>
  );
}

function Row({ poll, now, fresh }: { poll: Poll; now: number; fresh: boolean }) {
  const state = stateOf(poll, now);
  const top = lead(poll.content, poll.tally);
  const topic = topicOf(poll.content);
  const status =
    state === "open"
      ? `Open · closes in ${span(poll.closesAt - now)}`
      : state === "closed"
        ? "Closed · developing"
        : state === "refunded"
          ? "Refunded to the asker"
          : top
            ? `Fixed · ${top.share}% ${top.option}`
            : "Fixed · no answers";

  return (
    <li>
      {/* no prefetch: a burst of requests for exactly these polls would tell the server which ones you answered */}
      <Link href={`/poll/${poll.id}`} prefetch={false} className="grid gap-x-6 gap-y-1 py-4 hover:bg-paper/5 sm:grid-cols-[minmax(0,1fr)_16rem] sm:items-baseline">
        <span className="min-w-0 space-y-1">
          <span className="block font-mono text-xs uppercase tracking-[0.14em] text-silver">
            No. {poll.id}
            {topic && ` · ${topic}`}
            {fresh && <span className="ml-2 bg-paper px-1.5 py-0.5 text-developer">New</span>}
          </span>
          <span className="line-clamp-2 text-xl">{poll.content?.questions[0].q ?? (poll.hidden ? "Removed from the site" : "Question not published")}</span>
        </span>
        <span className="font-mono text-sm text-paper/80 sm:text-right">{status}</span>
      </Link>
    </li>
  );
}

/** Keep a poll on /me, in this browser only. */
export function SaveButton({ id }: { id: string }) {
  const on = parse<string[]>(useSyncExternalStore(subscribe, savedRaw, () => null), []).includes(id);
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => setSaved(id, !on)}
      className="border border-paper/60 px-3 py-1.5 font-mono text-xs text-paper hover:border-paper aria-pressed:bg-paper aria-pressed:text-developer"
    >
      {on ? "Saved" : "Save"}
    </button>
  );
}
