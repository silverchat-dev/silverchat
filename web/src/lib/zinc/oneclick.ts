/**
 * NEAR Intents' 1Click API: ZEC to ETH and back. Called from the browser (it allows any origin), never through our
 * server. A quote gives a one-time deposit address; once the coins land there, NEAR's solvers pay the other side.
 */
import { formatUnits, parseUnits } from "viem";

const API = "https://1click.chaindefuser.com/v0";
export const ZEC = { asset: "nep141:zec.omft.near", decimals: 8 } as const;
export const ETH = { asset: "nep141:eth.omft.near", decimals: 18 } as const;
type Asset = typeof ZEC | typeof ETH;

export type Quote = {
  depositAddress: string;
  amountIn: string;
  amountOut: string;
  minAmountOut: string;
  amountOutFormatted: string;
  timeEstimate: number;
  deadline: string;
};

export type Status = "PENDING_DEPOSIT" | "KNOWN_DEPOSIT_TX" | "PROCESSING" | "SUCCESS" | "INCOMPLETE_DEPOSIT" | "REFUNDED" | "FAILED";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...init, headers: { "content-type": "application/json" }, credentials: "omit", referrerPolicy: "no-referrer" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`NEAR Intents: ${body.message ?? res.status}`);
  return body as T;
}

/**
 * A quote that can be paid: `amount` of `from` (a decimal string) goes to `recipient` as `to`; if the swap cannot be
 * done, NEAR sends it back to `refundTo` on the chain it came from. One hour to pay, 1% slippage.
 */
export async function quote(from: Asset, to: Asset, amount: string, recipient: string, refundTo: string, dry = false) {
  const deadline = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const r = await call<{ quote: Omit<Quote, "deadline"> }>("/quote", {
    method: "POST",
    body: JSON.stringify({
      dry,
      swapType: "EXACT_INPUT",
      slippageTolerance: 100,
      originAsset: from.asset,
      depositType: "ORIGIN_CHAIN",
      destinationAsset: to.asset,
      amount: parseUnits(amount, from.decimals).toString(),
      refundTo,
      refundType: "ORIGIN_CHAIN",
      recipient,
      recipientType: "DESTINATION_CHAIN",
      deadline,
    }),
  });
  return { ...r.quote, deadline };
}

/** NEAR's dollar prices for ZEC and ETH. */
export async function prices() {
  const tokens = await call<{ assetId: string; price: number }[]>("/tokens");
  const usd = (a: string) => tokens.find((t) => t.assetId === a)?.price ?? NaN;
  return { zec: usd(ZEC.asset), eth: usd(ETH.asset) };
}

export async function status(depositAddress: string) {
  const r = await call<{ status: Status; swapDetails?: { destinationChainTxHashes?: { hash: string }[]; refundedAmountFormatted?: string } }>(
    `/status?depositAddress=${encodeURIComponent(depositAddress)}`,
  );
  return { status: r.status, out: r.swapDetails?.destinationChainTxHashes?.[0]?.hash, refunded: r.swapDetails?.refundedAmountFormatted };
}

/** Tells NEAR the deposit was sent, so it looks for it at once instead of waiting to notice it. */
export const submitted = (depositAddress: string, txHash: string) =>
  call("/deposit/submit", { method: "POST", body: JSON.stringify({ depositAddress, txHash }) }).catch(() => {});

/** ZIP-321 payment request: any Zcash wallet opens it with the address and the exact amount filled in. */
export const zip321 = (address: string, amountIn: string) => `zcash:${address}?amount=${formatUnits(BigInt(amountIn), ZEC.decimals)}`;

/** Zcash addresses NEAR pays out to: transparent (t1, t3) or unified (u1). It refuses Sapling (zs1) addresses. */
export const isZcashAddress = (a: string) => /^(t1|t3)[1-9A-HJ-NP-Za-km-z]{33}$|^u1[02-9ac-hj-np-z]{100,}$/.test(a.trim());
export const isTransparent = (a: string) => /^(t1|t3)/.test(a.trim());
