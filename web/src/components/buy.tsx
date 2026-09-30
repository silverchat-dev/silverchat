import { ADDR, ZERO } from "@/lib/config";

// the same places zipcoin.cash sends people: Uniswap for ZC, and SC's own page on Stockereum, where it trades against ZC
export const BUY_ZC = `https://app.uniswap.org/swap?chain=mainnet&inputCurrency=NATIVE&outputCurrency=${ADDR.zc}`;
const BUY_SC = `https://stockereum.com/t/${ADDR.sc}`;

/** Where a wallet short of the $20 hold can get it. The SC button shows once $SC has an address. */
export function Buy() {
  return (
    <p className="flex flex-wrap gap-3 font-mono text-sm">
      <a href={BUY_ZC} target="_blank" rel="noreferrer" className="bg-developer px-5 py-3 text-paper">
        Buy $20 of ZC
      </a>
      {ADDR.sc !== ZERO && (
        <a href={BUY_SC} target="_blank" rel="noreferrer" className="border border-developer/50 px-5 py-3">
          Buy $20 of SC
        </a>
      )}
    </p>
  );
}
