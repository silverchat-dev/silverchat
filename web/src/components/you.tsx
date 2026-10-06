"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useAccount, useSignMessage } from "wagmi";

import type { Tally } from "@/lib/algorithm";
import { receiptIds } from "@/lib/answer";
import { Empty, Part, action, quiet, second } from "@/components/journal";
import { topicOf, type Content } from "@/lib/content";
import { lead, span } from "@/lib/format";
import { isNew, parse, profileMessage, saveSeen, savedRaw, seenRaw, setSaved, stateOf, subscribe, type State } from "@/lib/you";

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
  // false on the server and the first paint: wagmi only knows a returning wallet after it mounts
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const loading = all.isPending || isReconnecting || !mounted;

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
    <div className="space-y-10">
      {all.isError && !all.data ? (
        <p role="alert" className="font-mono text-sm text-silver">
          Could not read the record. Try again in a minute.
        </p>
      ) : isReconnecting || !mounted ? null : !address ? (
        <Empty then={<Connect />}>Connect a wallet to see the polls you asked and answered.</Empty>
      ) : (
        <>
          <List
            title="Asked by you"
            polls={yours?.asked}
            seen={seen}
            now={now}
            empty="You have not asked a question with this wallet yet."
            next={{ href: "/ask", label: "Ask the network" }}
            loading={loading}
          />
          <List
            title="Answered on this device"
            polls={yours?.answered}
            seen={seen}
            now={now}
            empty="No answers from this wallet on this device. Answers you gave on another device are listed on that device."
            next={{ href: "/pulse", label: "Answer today's questions" }}
            loading={loading}
          />
        </>
      )}
      {!(all.isError && !all.data) && (
        <List
          title="Saved"
          polls={yours?.saved}
          seen={seen}
          now={now}
          empty="Nothing saved. Save a poll from its page to keep it here."
          next={{ href: "/pulse", label: "Find one on Pulse" }}
          loading={loading}
        />
      )}
      {/* the profile switch comes last: the polls are what a visitor comes here for */}
      {!(all.isError && !all.data) && address && mounted && !isReconnecting && <ProfileSwitch address={address} />}
    </div>
  );
}

type ListProps = {
  title: string;
  polls: Poll[] | undefined;
  seen: Record<string, State> | null;
  now: number;
  empty: string;
  next: { href: string; label: string };
  loading: boolean;
};

function List({ title, polls, seen, now, empty, next, loading }: ListProps) {
  return (
    <Part title={title} more={polls?.length ? <span className="text-silver tabular-nums">{polls.length}</span> : undefined}>
      {loading ? (
        <p className="font-mono text-sm text-silver">Reading the record…</p>
      ) : polls?.length ? (
        <ol className="ruled -mx-2">
          {polls.map((p) => (
            <Row key={p.id} poll={p} now={now} fresh={isNew(seen, p.id, stateOf(p, now))} />
          ))}
        </ol>
      ) : (
        <div className="space-y-3">
          <p className="max-w-[30em] text-lg leading-snug text-paper/80 italic">{empty}</p>
          <Link href={next.href} className={`${quiet} font-mono text-xs`}>
            {next.label} →
          </Link>
        </div>
      )}
    </Part>
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
      <Link
        href={`/poll/${poll.id}`}
        prefetch={false}
        className="group grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 rounded-md px-2 py-4 transition-colors hover:bg-paper/[0.04]"
      >
        <span className="min-w-0 space-y-2">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] uppercase tracking-[0.12em] text-silver">
            <span>
              No. {poll.id}
              {topic && ` · ${topic}`}
            </span>
            {fresh && <span className="rounded-full bg-paper px-2 py-0.5 tracking-[0.08em] text-developer">New</span>}
          </span>
          <span className="line-clamp-2 block text-[1.2rem] leading-snug text-balance">
            {poll.content?.questions[0].q ?? (poll.hidden ? "Removed from the site" : "Question not published")}
          </span>
          <span className={`block font-mono text-[11px] ${state === "open" ? "text-paper" : "text-silver"}`}>{status}</span>
        </span>
        <span aria-hidden className="pt-6 font-mono text-sm text-silver transition-transform group-hover:translate-x-0.5 group-hover:text-paper">
          →
        </span>
      </Link>
    </li>
  );
}

/** Connect a wallet as the one green action of a view. It opens the same wallet list as the button in the header. */
export function Connect({ children = "Connect a wallet" }: { children?: string }) {
  return (
    <ConnectButton.Custom>
      {({ openConnectModal, mounted }) => (
        <button type="button" onClick={openConnectModal} disabled={!mounted} className={action}>
          {children}
        </button>
      )}
    </ConnectButton.Custom>
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
      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-paper/35 px-4 font-mono text-[12px] tracking-[0.04em] text-paper transition-colors hover:border-paper aria-pressed:border-paper aria-pressed:bg-paper aria-pressed:text-developer"
    >
      <svg aria-hidden viewBox="0 0 12 14" className="h-3.5 w-3" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round">
        <path d="M1.5 1.5h9v11L6 9.5l-4.5 3z" />
      </svg>
      {on ? "Saved" : "Save"}
    </button>
  );
}

/** Show or hide this wallet's public profile, with one signature each way. */
function ProfileSwitch({ address }: { address: string }) {
  const { signMessageAsync } = useSignMessage();
  const state = useQuery({
    queryKey: ["profile", address],
    queryFn: async (): Promise<boolean> => {
      const res = await fetch(`/api/profile?address=${address}`);
      if (!res.ok) throw new Error(res.statusText);
      return (await res.json()).public === true;
    },
  });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const on = state.data;

  async function flip() {
    setBusy(true);
    setNote(null);
    const at = Math.floor(Date.now() / 1000);
    let signature: string;
    try {
      signature = await signMessageAsync({ message: profileMessage(address, !on, at) });
    } catch {
      setBusy(false);
      return setNote("You cancelled it in your wallet.");
    }
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address, public: !on, at, signature }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setNote(body.error ? `${body.error[0].toUpperCase()}${body.error.slice(1)}.` : "It did not go through. Try again.");
      await state.refetch();
    } catch {
      setNote("It did not go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (state.isError && on === undefined) return <p className="font-mono text-sm text-silver">Could not read your profile setting. Try again in a minute.</p>;
  if (on === undefined) return null;
  return (
    <Part title={`Public profile · ${on ? "on" : "off"}`}>
      <p className="max-w-[34em] leading-relaxed text-paper/80">
        {on ? (
          <>
            Anyone can open{" "}
            <Link href={`/u/${address.toLowerCase()}`} className={quiet}>
              your profile
            </Link>
            . It shows the polls you asked and the ZC you claimed. Ethereum shows both anyway. It does not show what you answered.
          </>
        ) : (
          "Make a page anyone can open, with the polls you asked and the ZC you claimed for answering. Both are already on Ethereum. What you answered stays private."
        )}
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <button type="button" onClick={flip} disabled={busy} className={second}>
          {busy ? "Sign the message in your wallet…" : on ? "Hide my profile" : "Show my profile"}
        </button>
        {note && (
          <span role="status" className="font-mono text-xs text-silver">
            {note}
          </span>
        )}
      </div>
    </Part>
  );
}
