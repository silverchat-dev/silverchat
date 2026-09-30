import "server-only";

const hits = new Map<string, number[]>();

/** True when `key` made more than `max` calls in the last `windowMs`. In memory, per instance. */
export function limited(key: string, max: number, windowMs = 60_000) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  // a Map keeps insertion order: drop the oldest half, not everyone's counters
  if (hits.size > 10_000) for (const k of [...hits.keys()].slice(0, 5_000)) hits.delete(k);
  return recent.length > max;
}

/** True when every client together made more RPC-backed requests this minute than the workers can spare. */
export const busy = () => limited("rpc", 600);

/** The proxy appends the address it saw, so the last hop is the one a client cannot fake. */
export const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ?? "local";
