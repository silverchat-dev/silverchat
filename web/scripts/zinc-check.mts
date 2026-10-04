// Zinc's pieces that can run outside a browser, against mainnet services, moving nothing: NEAR's dry quotes both ways,
// the burner's encryption round trip, and the burner provider the zkAPI SDK talks to.
//   pnpm dlx tsx scripts/zinc-check.mts
import assert from "node:assert/strict";

import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const { quote, ZEC, ETH, zip321, isZcashAddress } = await import("../src/lib/zinc/oneclick");
const { seal, open, burnerProvider } = await import("../src/lib/zinc/burner");

// a well-formed transparent address with no key behind it: dry quotes never use it
const T_ADDR = "t1Hsc1LR8yKnbbe3twRp88p6vFfC5t7DLbs";
const key = generatePrivateKey();
const me = privateKeyToAccount(key).address;

const zecIn = await quote(ZEC, ETH, "0.05", me, T_ADDR, true);
assert(BigInt(zecIn.amountOut) > 0n && BigInt(zecIn.minAmountOut) <= BigInt(zecIn.amountOut));
console.log(`0.05 ZEC -> ${zecIn.amountOutFormatted} ETH, about ${zecIn.timeEstimate}s`);

const ethIn = await quote(ETH, ZEC, "0.01", T_ADDR, me, true);
assert(BigInt(ethIn.amountOut) > 0n);
console.log(`0.01 ETH -> ${ethIn.amountOutFormatted} ZEC, about ${ethIn.timeEstimate}s`);

assert.equal(zip321("t1abc", "5000000"), "zcash:t1abc?amount=0.05");
assert(isZcashAddress(T_ADDR) && !isZcashAddress(me));

const sealed = await seal(key, "a long test password");
assert.equal(sealed.address, me);
assert.equal(await open(sealed, "a long test password"), key);
await assert.rejects(open(sealed, "the wrong password"), /wrong password/);

const p = burnerProvider(key);
assert.deepEqual(await p.request({ method: "eth_requestAccounts" }), [me]);
assert.equal(await p.request({ method: "eth_chainId" }), "0x1");
assert(BigInt((await p.request({ method: "eth_blockNumber" })) as string) > 20_000_000n, "reads reach mainnet");
await assert.rejects(p.request({ method: "eth_sendTransaction", params: [{ from: T_ADDR.replace(/^t1/, "0x"), to: me }] }), /burner/);

console.log("zinc: ok");
