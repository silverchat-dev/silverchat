"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useState } from "react";
import { useAccount } from "wagmi";

import { action } from "./journal";

/** The launch form, shown only to the Realm's own wallet. */
export function OwnerOnly({ realm, children }: { realm: string; children: React.ReactNode }) {
  const { address } = useAccount();
  if (address?.toLowerCase() !== realm) return null;
  return <>{children}</>;
}

/** The wallet's connect button drawn as the view's one green action; it opens the same wallet window. */
export function Connect({ label, className = "" }: { label: string; className?: string }) {
  return (
    <ConnectButton.Custom>
      {({ openConnectModal, mounted }) => (
        <button type="button" onClick={openConnectModal} disabled={!mounted} className={`${action} min-h-11 ${className}`}>
          {label}
        </button>
      )}
    </ConnectButton.Custom>
  );
}

/** Copy a token address, with a short "copied" note. */
export function CopyAddress({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard.writeText(value).then(() => (setDone(true), setTimeout(() => setDone(false), 1500)))}
      className="-my-2 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-silver underline decoration-paper/25 underline-offset-4 transition-colors hover:text-paper hover:decoration-paper"
      aria-label="Copy the token address"
    >
      <span aria-live="polite">{done ? "copied" : "copy"}</span>
    </button>
  );
}
