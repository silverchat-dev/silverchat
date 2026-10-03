/**
 * Railgun's broadcasters: community relayers that send a proved transaction for you and take their gas back in private
 * WETH, so a withdrawal to a fresh wallet needs no ETH there and links nothing to your public wallet. They are found
 * over Waku, a peer-to-peer network; their fee offers are checked against a reference signer, and the fee is shown
 * before anything is sent.
 */
import type { Address } from "viem";

import { ADDR } from "@/lib/config";

import type { Submit, Via } from "./actions";
import { engine } from "./engine";

// the reference fee signer the community Railgun wallets use: offers far from its fees are dropped
const FEE_SIGNER = (
  process.env.NEXT_PUBLIC_CASH_FEE_SIGNER ??
  "0zk1qyzgh9ctuxm6d06gmax39xutjgrawdsljtv80lqnjtqp3exxayuf0rv7j6fe3z53laetcl9u3cma0q9k4npgy8c8ga4h6mx83v09m8ewctsekw4a079dcl5sw4k"
).split(",");

type Client = typeof import("@railgun-community/waku-broadcaster-client-web");
let started: Promise<Client> | null = null;

/** Join Waku once per page; `status` reports Searching, Connected, AllUnavailable and so on. */
export function broadcasters(status: (s: string) => void) {
  started ??= (async () => {
    const [{ chain }, client] = await Promise.all([engine(), import("@railgun-community/waku-broadcaster-client-web")]);
    await client.WakuBroadcasterClient.start(chain, { trustedFeeSigner: FEE_SIGNER }, (_c, s) => status(s));
    return client;
  })().catch((e) => {
    started = null;
    throw e;
  });
  return started;
}

/**
 * The best broadcaster taking WETH for this kind of transaction, as a way to send it, or null when none is online.
 * `relayAdapt` is true for swaps and ETH withdrawals, which go through Railgun's RelayAdapt.
 */
export async function viaBroadcaster(relayAdapt: boolean): Promise<Via | null> {
  const client = await broadcasters(() => {});
  const { S, chain } = await engine();
  const b = client.WakuBroadcasterClient.findBestBroadcaster(chain, ADDR.weth, relayAdapt);
  if (!b) return null;
  const submit: Submit = async (p) => {
    const tx = await client.BroadcasterTransaction.create(
      S.TXIDVersion.V2_PoseidonMerkle,
      p.to,
      p.data,
      b.railgunAddress,
      b.tokenFee.feesID,
      chain,
      p.nullifiers,
      p.minGasPrice,
      p.relayAdapt,
      p.pois as never,
    );
    return tx.send();
  };
  return { kind: "broadcaster", submit, fee: { token: ADDR.weth as Address, perUnitGas: BigInt(b.tokenFee.feePerUnitGas), recipient: b.railgunAddress } };
}
