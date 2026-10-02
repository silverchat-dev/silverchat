"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { useState } from "react";
import { useAccount } from "wagmi";

/** The way into your own Realm: your wallet's page, where you launch. */
export function YourRealmLink() {
  const { address } = useAccount();
  if (!address) return <ConnectButton label="Connect a wallet to open your Realm" />;
  return (
    <Link href={`/realm/${address.toLowerCase()}`} className="inline-block bg-paper px-5 py-2.5 font-mono text-sm text-developer">
      Your Realm
    </Link>
  );
}

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
