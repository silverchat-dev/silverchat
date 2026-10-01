import { ADDR, CHAIN_ID } from "./config";

/** What only this browser knows: the polls saved here and the last status seen for each of a wallet's polls. */
const base = `silverchat:${CHAIN_ID}:${ADDR.ask.toLowerCase()}`;
const CHANGED = "silverchat:local";

const savedKey = `${base}:saved`;
const seenKey = (wallet: string) => `${base}:seen:${wallet.toLowerCase()}`;

/** For useSyncExternalStore: other tabs fire `storage`, this tab fires CHANGED. */
export function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

/** The raw string, so React can compare snapshots; `parse` reads it. */
function raw(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function parse<T>(text: string | null, empty: T): T {
  try {
    return JSON.parse(text ?? "null") ?? empty;
  } catch {
    return empty;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new Event(CHANGED));
  } catch {}
}

export const savedRaw = () => raw(savedKey);

export function setSaved(id: string, on: boolean) {
  const ids = parse<string[]>(savedRaw(), []).filter((x) => x !== id);
  write(savedKey, on ? [id, ...ids] : ids);
}

/** Open, closed (waiting for its result), final or refunded. */
export type State = "open" | "closed" | "final" | "refunded";

export const stateOf = (p: { status: "open" | "final" | "refunded"; closesAt: number }, now: number): State =>
  p.status === "open" && p.closesAt <= now ? "closed" : p.status;

/** Null until the first visit to /me ends, so a first visit marks nothing as new. */
export const seenRaw = (wallet: string) => raw(seenKey(wallet));

export const saveSeen = (wallet: string, states: Record<string, State>) => write(seenKey(wallet), states);

/** A poll is new when its status moved since the last visit; one never seen counts as seen open. */
export const isNew = (seen: Record<string, State> | null, id: string, state: State) => !!seen && (seen[id] ?? "open") !== state;
