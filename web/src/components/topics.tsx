import Link from "next/link";

import { TOPICS, type Topic } from "@/lib/content";

/** The topic from a `?topic=` search param, or null for All. */
export const pickTopic = (raw: string | string[] | undefined): Topic | null =>
  TOPICS.find((t) => t.toLowerCase() === String(raw ?? "").toLowerCase()) ?? null;

/** Filter links over a list that keeps its own order. Polls from before topics existed show under All only. */
export function Topics({ base, active }: { base: string; active: Topic | null }) {
  return (
    <nav aria-label="Topics" className="flex flex-wrap gap-2 font-mono text-xs uppercase tracking-[0.12em]">
      {[null, ...TOPICS].map((t) => (
        <Link
          key={t ?? "all"}
          href={t ? `${base}?topic=${t.toLowerCase()}` : base}
          aria-current={t === active ? "page" : undefined}
          className="border border-silver/40 px-3 py-1.5 text-paper/75 hover:border-paper hover:text-paper aria-[current=page]:border-paper aria-[current=page]:bg-paper aria-[current=page]:text-developer"
        >
          {t ?? "All"}
        </Link>
      ))}
    </nav>
  );
}
