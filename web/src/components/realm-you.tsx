"use client";

import { useState } from "react";
import { useAccount } from "wagmi";

/** The launch form, shown only to the Realm's own wallet. */
export function OwnerOnly({ realm, children }: { realm: string; children: React.ReactNode }) {
  const { address } = useAccount();
  if (address?.toLowerCase() !== realm) return null;
  return <>{children}</>;
}

/** Copy a token address, with a short "copied" note. */
export function CopyAddress({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard.writeText(value).then(() => (setDone(true), setTimeout(() => setDone(false), 1500)))}
      className="font-mono text-xs text-silver hover:text-paper"
      aria-label="Copy the token address"
    >
      {done ? "copied" : "copy"}
    </button>
  );
}
