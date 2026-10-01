"use client";

import { useEffect, useState } from "react";
import { useBlock } from "wagmi";

const SLOT = 12;

export function BlockClock() {
  const { data: block } = useBlock({ watch: true });
  const [now, setNow] = useState(0);

  useEffect(() => {
    const tick = () => setNow(Math.floor(Date.now() / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  if (!block || !now) return <span className="font-mono text-xs tracking-wider text-silver">···</span>;

  // Blocks land on 12s slots, the book's ticks ("After about ten ticks, the roof was closed", Snowmoon, ch. 27), so
  // count down to the next slot even if the last poll is a bit stale.
  const next = SLOT - (Math.max(0, now - Number(block.timestamp)) % SLOT);
  return (
    <span className="font-mono text-xs tracking-wider tabular-nums text-paper/85" title="Ethereum mainnet">
      <span className="hidden md:inline">BLOCK </span>
      {block.number.toLocaleString("en-US")} · <span className="hidden md:inline">next in </span>
      {String(next).padStart(2, "0")}s
    </span>
  );
}
