import { Tabs } from "@/components/journal";

import { TOPICS, type Topic } from "@/lib/content";

/** The topic from a `?topic=` search param, or null for All. */
export const pickTopic = (raw: string | string[] | undefined): Topic | null =>
  TOPICS.find((t) => t.toLowerCase() === String(raw ?? "").toLowerCase()) ?? null;

/** Filter links over a list that keeps its own order. Polls from before topics existed show under All only. */
export function Topics({ base, active }: { base: string; active: Topic | null }) {
  return (
    <Tabs
      label="Topics"
      items={[null, ...TOPICS].map((t) => ({ href: t ? `${base}?topic=${t.toLowerCase()}` : base, label: t ?? "All", active: t === active }))}
    />
  );
}
