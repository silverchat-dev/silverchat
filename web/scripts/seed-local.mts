// Fills the local fork with test data through the real contracts and APIs: SilverRealm launches and trades, settled and
// open Predict markets, fixed and open polls, public profiles and an agent.
// Prereq: anvil fork + ./scripts/local-up.sh, and the web app running with web/.env.local (ENABLE_WORKERS=1).
//   npx -y tsx scripts/seed-local.mts
// Order matters: SilverRealm first (a launch needs Chainlink ETH/USD under 3 hours old by chain time), then everything
// that needs time warps, then the open polls and markets, which must stay open.
// Re-run: each part is skipped once its data is there.
import { readFileSync } from "node:fs";
import { crc32, deflateSync } from "node:zlib";

import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  erc20Abi,
  http,
  keccak256,
  parseEther,
  parseEventLogs,
  parseUnits,
  stringToBytes,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

import { askAbi, predictAbi, realmFactoryAbi, realmHookAbi, routerAbi } from "../src/lib/abi";
import { agentTypes } from "../src/lib/agent";
import { AGES, REGIONS, tagsHash, types } from "../src/lib/answer";
import { commitmentOf, FEEDS, NO, questionString, YES, type Side } from "../src/lib/market";
import { profileMessage } from "../src/lib/you";

const RPC = "http://127.0.0.1:8545";
const APP = process.env.APP_URL ?? "http://localhost:3200";
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => l.split(/=(.*)/).slice(0, 2) as [string, string]),
);
const ASK = env.NEXT_PUBLIC_ASK as Address;
const PREDICT = env.NEXT_PUBLIC_PREDICT as Address;
const FACTORY = env.NEXT_PUBLIC_REALM_FACTORY as Address;
const HOOK = env.NEXT_PUBLIC_REALM_HOOK as Address;
const ZC = "0x4E67DB19044549fF420860834c91b45BaD298722" as Address;
const SC = "0x3C3959052f60cbddC498b384958841b718112353" as Address;
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as Address;
const STOCKER = "0x75E2Fc69Ff2ac12aF65Ba7D321bBf4f878c535d2" as Address;
const ROUTER = "0xcdf832D2C11DA16055bb6C6145cF38EDD7233767" as Address;
const ETH_USD = FEEDS["ETH/USD"] as Address;
const POOL_MANAGER = "0x000000000004444c5dc75cB358380D2e3dE08A90" as Address;
const REALITY = "0x5b7dD1E86623548AF054A4985F7fc8Ccbb554E2c" as Address;

// anvil's public test mnemonic; 0..4 are the app's own roles, so the seed uses 5 and up
const MNEMONIC = "test test test test test test test test test test test junk";
const acct = (i: number) => mnemonicToAccount(MNEMONIC, { addressIndex: i });
type Account = ReturnType<typeof acct>;
const ASKERS = [5, 9, 10].map(acct);
const VOTERS = [6, 7, 8, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21].map(acct);
const ANSWERER = acct(22);

const pub = createPublicClient({ chain: foundry, transport: http(RPC) });
const wallet = (account: Account) => createWalletClient({ account, chain: foundry, transport: http(RPC) });
const rpc = async (method: string, params: unknown[]) => {
  const r = await (await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json();
  if (r.error) throw new Error(`${method}: ${r.error.message}`);
  return r.result;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (s: string) => console.log(s);
async function until<T>(what: string, fn: () => Promise<T | null | undefined | false>, seconds = 240): Promise<T> {
  for (let i = 0; i < seconds; i++) {
    const v = await fn().catch(() => null);
    if (v) return v;
    await sleep(1000);
  }
  throw new Error(`timed out waiting for ${what}`);
}
const tx = async (hash: Hex) => {
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`reverted: ${hash}`);
  return r;
};
// each call from its own made-up address, so the app's per-address rate limits do not stop the seed
let ip = 0;
const app = (path: string, init: RequestInit = {}) =>
  fetch(`${APP}${path}`, { ...init, headers: { "content-type": "application/json", "x-forwarded-for": `10.9.${(ip >> 8) & 255}.${ip++ & 255}`, ...init.headers } });
const post = (path: string, body: unknown) => app(path, { method: "POST", body: JSON.stringify(body) });
const chainNow = async () => Number((await pub.getBlock()).timestamp);
const warpTo = async (ts: number) => {
  await rpc("evm_increaseTime", [Math.max(0, ts - (await chainNow()))]);
  await rpc("evm_mine", []);
};
// a fixed seed, so a re-run picks the same answers
let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
const salt = () => toHex(crypto.getRandomValues(new Uint8Array(32)));
const DAY = 86_400;

// ---- safety: this script only ever writes to the local fork
if ((await pub.getChainId()) !== 31337) throw new Error("not the local fork (chain id 31337); refusing to write");
if (Number(env.NEXT_PUBLIC_CHAIN_ID) !== 31337) throw new Error("web/.env.local does not point at the local fork");

// ---- funding: ETH by anvil, ZC and SC out of the v4 PoolManager (only topped up when low)
const balance = (token: Address, who: Address) => pub.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [who] });
await rpc("anvil_impersonateAccount", [POOL_MANAGER]);
await rpc("anvil_setBalance", [POOL_MANAGER, toHex(parseEther("100"))]);
const give = async (token: Address, who: Address, amount: bigint) => {
  if ((await balance(token, who)) >= amount / 2n) return;
  const hash = await rpc("eth_sendTransaction", [{ from: POOL_MANAGER, to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [who, amount] }) }]);
  await tx(hash);
};
for (const a of [...ASKERS, ...VOTERS, ANSWERER]) {
  if ((await pub.getBalance({ address: a.address })) < parseEther("100")) await rpc("anvil_setBalance", [a.address, toHex(parseEther("1000"))]);
}
// the PoolManager's tokens back its pools, so take only what the seed needs and hand any surplus back
const want = (a: Account) => (ASKERS.includes(a) ? [parseUnits("1500000", 18), parseUnits("3000000", 18)] : [parseUnits("60000", 18), parseUnits("4000000", 18)]);
for (const a of [...ASKERS, ...VOTERS]) {
  for (const [token, keep] of [ZC, SC].map((t, i) => [t, want(a)[i] * 2n] as const)) {
    const has = await balance(token, a.address);
    if (has > keep) await tx(await wallet(a).writeContract({ address: token, abi: erc20Abi, functionName: "transfer", args: [POOL_MANAGER, has - keep / 2n] }));
  }
}
for (const a of [...ASKERS, ...VOTERS]) {
  const [zc, sc] = want(a);
  await give(ZC, a.address, zc);
  await give(SC, a.address, sc);
}
await rpc("anvil_stopImpersonatingAccount", [POOL_MANAGER]);
log(`funded ${ASKERS.length} askers and ${VOTERS.length} voters`);

// ======================================================================= SilverRealm
type Launch = { name: string; symbol: string; base: Address; fee: 10_000 | 20_000 | 30_000; about: string; x?: string; hue: number; buysUsd: number[]; sells: number; dev?: string };
const LAUNCHES: Launch[] = [
  { name: "Darkroom", symbol: "DRKRM", base: WETH, fee: 10_000, about: "For everyone who develops their own film. The lights stay off.", x: "darkroomcoin", hue: 18, buysUsd: [5200, 4100, 4800, 3600, 900, 9500], sells: 1, dev: "0.2" },
  { name: "Fixer Bath", symbol: "FIXER", base: WETH, fee: 20_000, about: "Keeps the image from fading. Hold it for 30 seconds, then rinse.", hue: 200, buysUsd: [3100, 2400, 2900, 800, 5400], sells: 1 },
  { name: "Silver Halide", symbol: "HALIDE", base: ZC, fee: 10_000, about: "The crystal that turns light into a picture.", x: "halide_ag", hue: 260, buysUsd: [900, 1400, 600], sells: 1 },
  { name: "Contact Sheet", symbol: "CONTACT", base: SC, fee: 30_000, about: "Every frame of the roll on one page. Pick the keeper.", hue: 120, buysUsd: [400, 650, 300], sells: 1 },
  { name: "Stop Bath", symbol: "STOP", base: STOCKER, fee: 20_000, about: "Ends development in a second. A small acid for a small cap.", hue: 50, buysUsd: [250, 180], sells: 1 },
  { name: "Grain", symbol: "GRAIN", base: WETH, fee: 10_000, about: "ISO 3200, pushed two stops.", hue: 330, buysUsd: [120, 90, 160, 70], sells: 2 },
];

/** A small PNG: a two-tone gradient with a lighter disc, in the token's own hue. */
function png(hue: number) {
  const n = 128;
  const hsl = (h: number, s: number, l: number) => {
    const f = (k: number) => {
      const a = s * Math.min(l, 1 - l);
      const m = (k + h / 30) % 12;
      return Math.round(255 * (l - a * Math.max(-1, Math.min(m - 3, 9 - m, 1))));
    };
    return [f(0), f(8), f(4)];
  };
  const rows: number[] = [];
  for (let y = 0; y < n; y++) {
    rows.push(0);
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x - n * 0.62, y - n * 0.4) / n;
      const l = d < 0.22 ? 0.78 - d : 0.18 + ((x + y) / (2 * n)) * 0.35;
      rows.push(...hsl(hue, 0.55, l));
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0);
  ihdr.writeUInt32BE(n, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.from(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const realmKey = (token: Address, base: Address) => {
  const [c0, c1] = BigInt(token) < BigInt(base) ? [token, base] : [base, token];
  return { currency0: c0, currency1: c1, fee: 0, tickSpacing: 200, hooks: HOOK };
};

type Listed = { symbol: string; token: Address; poolId: Hex; realm: string; trades: number };
const realmNow = (await (await app("/api/realm?sort=new")).json()) as { total: number; tokens: Listed[] };
const listed = new Map(realmNow.tokens.map((t) => [t.symbol, t]));
const burnEth = await pub.readContract({ address: FACTORY, abi: realmFactoryAbi, functionName: "ethForBurn" }).catch(() => null);
let launched = 0;
let trades = 0;
// a launch with a first buy counts that buy as its first trade
const untraded = (l: Launch) => (listed.get(l.symbol)?.trades ?? 0) <= (l.dev ? 1 : 0);
if (!LAUNCHES.some(untraded)) {
  log(`realm: ${realmNow.total} tokens with trades already, skipped`);
} else if (burnEth === null) {
  log("realm: skipped, Chainlink ETH/USD is more than 3 hours old by chain time (a warp ran first); restart the fork to launch");
} else {
  const health = await (await app("/api/health")).json();
  const [, ethAnswer] = await pub.readContract({ address: ETH_USD, abi: [{ type: "function", name: "latestRoundData", stateMutability: "view", inputs: [], outputs: [{ type: "uint80" }, { type: "int256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint80" }] }] as const, functionName: "latestRoundData" });
  const usd: Record<string, number> = { [WETH]: Number(ethAnswer) / 1e8, [ZC]: Number(health.zcUsd), [SC]: Number(health.scUsd), [STOCKER]: Number(health.stockerUsd) };
  const made: { l: Launch; token: Address; key: ReturnType<typeof realmKey>; poolId: Hex; creator: Account }[] = [];
  for (const [i, l] of LAUNCHES.entries()) {
    const old = listed.get(l.symbol);
    // launched on an earlier run: only its trades are left to do
    if (old) {
      if (untraded(l)) made.push({ l, token: old.token, key: realmKey(old.token, l.base), poolId: old.poolId, creator: VOTERS.find((v) => v.address.toLowerCase() === old.realm)! });
      continue;
    }
    if (!usd[l.base]) throw new Error(`no dollar price for ${l.symbol}'s base`);
    const creator = VOTERS[i];
    const img = await app("/api/realm/image", { method: "POST", body: png(l.hue), headers: { "content-type": "image/png" } });
    if (!img.ok) throw new Error(`image upload: ${img.status} ${await img.text()}`);
    const meta = await post("/api/realm/meta", { image: (await img.json()).uri, description: l.about, website: null, x: l.x ?? null });
    if (!meta.ok) throw new Error(`meta: ${meta.status} ${await meta.text()}`);
    const uri = (await meta.json()).uri as string;
    const dev = l.dev ? parseEther(l.dev) : 0n;
    const openingFdv = parseUnits((4000 / usd[l.base]).toFixed(6), 18);
    const r = await tx(
      await wallet(creator).writeContract({
        address: FACTORY,
        abi: realmFactoryAbi,
        functionName: "launch",
        args: [{ name: l.name, symbol: l.symbol, uri, base: l.base, feePpm: l.fee, openingFdv, minScBurned: 0n, devBuyEth: dev, minTokensOut: 0n }],
        value: (burnEth * 102n) / 100n + dev,
      }),
    );
    const ev = parseEventLogs({ abi: realmFactoryAbi, logs: r.logs, eventName: "Launched" })[0].args;
    made.push({ l, token: ev.token, key: realmKey(ev.token, l.base), poolId: ev.poolId, creator });
    launched++;
    log(`realm: launched ${l.symbol} at ${ev.token}`);
  }
  // the first 20 seconds after a launch charge up to 99%; wait them out on the wall clock rather than warping
  for (const m of made) {
    await until(`${m.l.symbol}'s normal fee`, async () => (await rpc("evm_mine", [])) && (await pub.readContract({ address: HOOK, abi: realmHookAbi, functionName: "currentFee", args: [m.poolId] })) <= BigInt(m.l.fee), 90);
  }
  for (const m of made) {
    const traders = VOTERS.filter((v) => v !== m.creator);
    const bought: Account[] = [];
    for (const [j, dollars] of m.l.buysUsd.entries()) {
      const who = traders[(j * 3 + LAUNCHES.indexOf(m.l)) % traders.length];
      const w = wallet(who);
      if (m.l.base === WETH) {
        const value = parseEther((dollars / usd[WETH]).toFixed(6));
        await tx(await w.writeContract({ address: ROUTER, abi: routerAbi, functionName: "buyWethPairWithEth", args: [m.key, 0n, "0x"], value }));
      } else if (m.l.base === SC) {
        const amount = parseUnits((dollars / usd[SC]).toFixed(0), 18);
        await tx(await w.writeContract({ address: SC, abi: erc20Abi, functionName: "approve", args: [ROUTER, amount] }));
        await tx(await w.writeContract({ address: ROUTER, abi: routerAbi, functionName: "buy", args: [m.key, SC, amount, 0n, "0x"] }));
      } else {
        const value = parseEther((dollars / usd[WETH]).toFixed(6));
        await tx(await w.writeContract({ address: ROUTER, abi: routerAbi, functionName: "buyWithEth", args: [m.key, m.l.base, 0n, 0n, "0x"], value }));
      }
      bought.push(who);
      trades++;
    }
    // a few holders take some profit: a third of what they hold
    for (const who of bought.slice(0, m.l.sells)) {
      const w = wallet(who);
      const amount = (await balance(m.token, who.address)) / 3n;
      if (amount === 0n) continue;
      await tx(await w.writeContract({ address: m.token, abi: erc20Abi, functionName: "approve", args: [ROUTER, amount] }));
      if (m.l.base === WETH) await tx(await w.writeContract({ address: ROUTER, abi: routerAbi, functionName: "sellWethPairForEth", args: [m.key, m.token, amount, 0n, "0x"] }));
      else if (m.l.base === SC) await tx(await w.writeContract({ address: ROUTER, abi: routerAbi, functionName: "sell", args: [m.key, m.token, SC, amount, 0n, "0x"] }));
      else await tx(await w.writeContract({ address: ROUTER, abi: routerAbi, functionName: "sellForEth", args: [m.key, m.token, m.l.base, amount, 0n, 0n, "0x"] }));
      trades++;
    }
  }
  await until("the realm indexer", async () => (await (await app("/api/realm?sort=new")).json()).total >= realmNow.total + launched, 120);
  log(`realm: ${launched} launched, ${trades} trades`);
}

// ======================================================================= polls helpers
const domain = { name: "Silverchat", version: "1", chainId: foundry.id, verifyingContract: ASK } as const;
type Q = { q: string; options: string[] };
type Poll = { topic: string; questions: Q[]; breadth: 10 | 100 | 1000 | 10_000; priority: 0 | 1 | 2; hours: number; answers: number };

async function ask(p: Poll, asker: Account) {
  const text = JSON.stringify({ v: 2, topic: p.topic, questions: p.questions });
  const hash = keccak256(stringToBytes(text));
  const draft = await app("/api/polls", { method: "POST", body: text });
  if (!draft.ok) throw new Error(`draft refused: ${draft.status} ${await draft.text()}`);
  const cost = await pub.readContract({ address: ASK, abi: askAbi, functionName: "costOf", args: [BigInt(p.breadth), p.priority] });
  const w = wallet(asker);
  await tx(await w.writeContract({ address: ZC, abi: erc20Abi, functionName: "approve", args: [ASK, cost] }));
  const r = await tx(await w.writeContract({ address: ASK, abi: askAbi, functionName: "ask", args: [hash, p.breadth, p.priority, p.hours * 3600, cost] }));
  return parseEventLogs({ abi: askAbi, logs: r.logs, eventName: "Asked" })[0].args.id;
}

async function answer(id: bigint, p: Poll) {
  await until(`poll ${id} indexed`, async () => (await app(`/api/polls/${id}`)).ok, 120);
  // each question leans toward one option, as real answers do
  const lean = p.questions.map((q) => Math.floor(rand() * q.options.length));
  for (const v of VOTERS.slice(0, p.answers)) {
    const choices = p.questions.map((q, i) => (rand() < 0.5 ? lean[i] : Math.floor(rand() * q.options.length)));
    const [region, age] = rand() < 0.8 ? [pick(REGIONS), pick(AGES)] : ["", ""];
    const s = salt();
    const signature = await wallet(v).signTypedData({ domain, types, primaryType: "Answer", message: { pollId: id, choices, tagsHash: tagsHash(region, age), salt: s } });
    const res = await post("/api/answer", { pollId: String(id), voter: v.address, choices, region, age, salt: s, signature });
    if (!res.ok && res.status !== 409) throw new Error(`answer to poll ${id}: ${res.status} ${await res.text()}`);
  }
}

const one = (topic: string, q: string, options: string[], o: Partial<Poll> = {}): Poll => ({ topic, questions: [{ q, options }], breadth: 100, priority: 0, hours: 1, answers: 8, ...o });

const FIXED: Poll[] = [
  one("Crypto", "Did you move any coins off an exchange this year?", ["Yes, all of them", "Some", "No"], { answers: 12 }),
  one("AI", "Do you check an AI's answer before you use it at work?", ["Always", "Most of the time", "Rarely", "I don't use AI at work"], { breadth: 1000, answers: 14 }),
  one("Markets", "Where do you keep most of your savings?", ["Bank account", "Index funds", "Single stocks", "Crypto", "Gold or cash"], { answers: 11 }),
  one("Sports", "Who wins the 2026 World Cup final?", ["Argentina", "France", "Brazil", "Another team"], { breadth: 10, answers: 9 }),
  {
    topic: "Culture",
    questions: [
      { q: "How do you mostly listen to music?", options: ["Streaming app", "Radio", "Vinyl or CDs", "Live shows"] },
      { q: "Did you buy a physical album this year?", options: ["Yes", "No"] },
    ],
    breadth: 100,
    priority: 1,
    hours: 1,
    answers: 10,
  },
  one("Science", "Would you take a seat on the first crewed flight to Mars?", ["Yes", "No", "Only on the second flight"], { answers: 13 }),
];

const OPEN: Poll[] = [
  one("Crypto", "Will you use a Layer 2 for most of your Ethereum transactions next year?", ["Yes", "No", "I already do"], { breadth: 1000, hours: 6 * 24, answers: 9 }),
  one("Crypto", "Which wallet do you use most?", ["MetaMask", "Rabby", "A hardware wallet", "A Safe", "Something else"], { hours: 3 * 24, answers: 6 }),
  one("AI", "Should AI labs publish the data they train on?", ["Yes, all of it", "Only a summary", "No"], { breadth: 1000, priority: 2, hours: 5 * 24, answers: 11 }),
  one("AI", "How many hours a week do you talk to an AI assistant?", ["None", "Under 2", "2 to 10", "More than 10"], { hours: 2 * 24, answers: 4 }),
  one("Markets", "Where will the S&P 500 close this year compared to where it opened?", ["Higher by over 10%", "Higher by under 10%", "Lower"], { breadth: 10_000, hours: 14 * 24, answers: 7 }),
  {
    topic: "Markets",
    questions: [
      { q: "Do you expect interest rates to go down in the next six months?", options: ["Yes", "No", "No change"] },
      { q: "Are you planning to buy a home in the next two years?", options: ["Yes", "No", "I already own one"] },
    ],
    breadth: 100,
    priority: 0,
    hours: 4 * 24,
    answers: 5,
  },
  one("Politics", "Should voting age be lowered to 16?", ["Yes", "No", "Only for local elections"], { breadth: 1000, priority: 1, hours: 7 * 24, answers: 12 }),
  one("Politics", "Do you trust official inflation numbers?", ["Yes", "Somewhat", "No"], { hours: 3 * 24, answers: 3 }),
  one("Sports", "Who wins the next Champions League?", ["Real Madrid", "Manchester City", "Bayern Munich", "Arsenal", "Another club"], { breadth: 100, hours: 10 * 24, answers: 8 }),
  one("Sports", "Should football use semi-automated offside in every league?", ["Yes", "No"], { breadth: 10, hours: 26, answers: 2 }),
  one("Culture", "Which do you watch more: films or series?", ["Films", "Series", "About the same", "Neither"], { hours: 5 * 24, answers: 10 }),
  one("Science", "Will a fusion plant put power on a grid before 2035?", ["Yes", "No", "Not sure"], { breadth: 1000, hours: 9 * 24, answers: 6 }),
  one("Science", "Did you get a flu shot this season?", ["Yes", "Not yet", "No"], { breadth: 10, hours: 2 * 24, answers: 0 }),
  one("Other", "How many days a week do you work from home?", ["0", "1 to 2", "3 to 4", "5"], { breadth: 100, priority: 1, hours: 8 * 24, answers: 9 }),
];

// ======================================================================= Predict helpers
const sealsOf = new Map<string, { staker: Account; side: Side; salt: Hex }[]>();
const lock = await pub.readContract({ address: PREDICT, abi: predictAbi, functionName: "lockAmount" });
async function openEvent(opener: Account, title: string, topic: string, closesAt: number, resolvesAt: number, bounty = 0n) {
  const w = wallet(opener);
  await tx(await w.writeContract({ address: SC, abi: erc20Abi, functionName: "approve", args: [PREDICT, lock] }));
  const r = await tx(await w.writeContract({ address: PREDICT, abi: predictAbi, functionName: "openEvent", args: [questionString(title, topic), closesAt, resolvesAt], value: bounty }));
  return parseEventLogs({ abi: predictAbi, logs: r.logs, eventName: "Opened" })[0].args.id;
}
async function openPrice(opener: Account, feed: Address, usd: number, closesAt: number, resolvesAt: number) {
  const w = wallet(opener);
  await tx(await w.writeContract({ address: SC, abi: erc20Abi, functionName: "approve", args: [PREDICT, lock] }));
  const r = await tx(await w.writeContract({ address: PREDICT, abi: predictAbi, functionName: "openPrice", args: [toHex(0, { size: 32 }), feed, parseUnits(String(usd), 8), closesAt, resolvesAt] }));
  return parseEventLogs({ abi: predictAbi, logs: r.logs, eventName: "Opened" })[0].args.id;
}
// stakers with their sides; amounts in ZC
async function stakeOn(id: bigint, who: { v: Account; side: Side; zc: number }[]) {
  const kept: { staker: Account; side: Side; salt: Hex }[] = [];
  for (const { v, side, zc } of who) {
    const amount = parseUnits(String(zc), 18);
    // derived, not random, so a re-run after a crash can still reveal
    const s = keccak256(stringToBytes(`seed-local:${PREDICT}:${id}:${v.address}`));
    kept.push({ staker: v, side, salt: s });
    if ((await pub.readContract({ address: PREDICT, abi: predictAbi, functionName: "stakes", args: [id, v.address] }))[0] > 0n) continue;
    const w = wallet(v);
    await tx(await w.writeContract({ address: ZC, abi: erc20Abi, functionName: "approve", args: [PREDICT, amount] }));
    await tx(await w.writeContract({ address: PREDICT, abi: predictAbi, functionName: "stake", args: [id, amount, commitmentOf(id, v.address, side, s)] }));
  }
  sealsOf.set(String(id), kept);
}
// one transaction reveals several stakers' sides; anyone may send it
async function reveal(id: bigint, who: { staker: Account; side: Side; salt: Hex }[]) {
  if (!who.length) return;
  await tx(await wallet(ANSWERER).writeContract({ address: PREDICT, abi: predictAbi, functionName: "reveal", args: [id, who.map((x) => x.staker.address), who.map((x) => x.side), who.map((x) => x.salt)] }));
}
const market = async (id: bigint) => (await app(`/api/markets/${id}`)).json();
type Listed2 = { id: string; title: string; status: string };
const marketList = async () => (await (await app("/api/markets")).json()).markets as Listed2[];
// an open market with this title from an earlier run that still takes stakes, so a re-run picks it up
async function reuse(title: string) {
  const m = (await marketList()).find((x) => x.title === title && x.status === "open");
  if (!m) return null;
  const closesAt = (await pub.readContract({ address: PREDICT, abi: predictAbi, functionName: "market", args: [BigInt(m.id)] })).closesAt;
  return closesAt > (await chainNow()) + 300 ? { id: BigInt(m.id), closesAt } : null;
}
const realityAbi = [{ type: "function", name: "submitAnswer", stateMutability: "payable", inputs: [{ type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }], outputs: [] }] as const;
const V = VOTERS;
const side = (i: number, yes: boolean, zc: number) => ({ v: V[i], side: (yes ? YES : NO) as Side, zc });

// ======================================================================= phase with warps: settled markets, fixed polls
const finals = (await (await app("/api/polls?status=final&limit=100")).json()).polls.length as number;
const existingMarkets = (await (await app("/api/markets")).json()).markets as { status: string }[];
let fixedMade = 0;
const settledIds: string[] = [];
let revealing: bigint | null = null;
if (finals > 0 || existingMarkets.some((m) => m.status !== "open")) {
  log(`warp phase: already done (${finals} fixed polls), skipped so the open polls and markets stay open`);
} else {
  // Predict: four event markets that close in 2 hours, settle YES, NO, YES and void (answered invalid)
  const t0 = await chainNow();
  const opener = ASKERS[0];
  const SETTLED = [
    { title: "Will Ethereum ship its Fusaka upgrade on mainnet before December 2026?", topic: "Crypto", answer: 1n },
    { title: "Will an AI model pass 90% on the ARC-AGI-2 benchmark by October 2026?", topic: "AI", answer: 0n },
    { title: "Will the US Federal Reserve lower rates at its September 2026 meeting?", topic: "Markets", answer: 1n },
    { title: "Will the 2026 Boston Marathon men's race be won in under 2:05?", topic: "Sports", answer: 2n ** 256n - 1n },
  ];
  const first = await reuse(SETTLED[0].title);
  const closesAt = first ? first.closesAt : t0 + 2 * 3600 + 120;
  const resolvesAt = closesAt + 3600;
  const settleAt = closesAt + 72 * 3600 + 2 * DAY + 1;
  const ids: bigint[] = [];
  for (const m of SETTLED) ids.push((await reuse(m.title))?.id ?? (await openEvent(opener, m.title, m.topic, closesAt, resolvesAt, parseEther("0.01"))));
  // the one left in its reveal window at the end: it closes during the fixed polls' hour
  const rTitle = "Will the Bitcoin network hashrate pass 1,500 EH/s during 2026?";
  revealing = (await reuse(rTitle))?.id ?? (await openEvent(ASKERS[1], rTitle, "Crypto", settleAt + 1800, settleAt + 1800 + 7 * DAY));
  // the same core of forecasters on every market, so the scores board has rows with 3 or more settled
  const truth = [true, false, true, true];
  for (const [k, id] of ids.entries()) {
    const right = truth[k];
    await stakeOn(id, [side(0, right, 12000), side(1, right, 4000), side(2, !right, 8000), side(3, k % 2 === 0 ? right : !right, 2500), side(4, right, 900), side(5 + k, !right, 1500)]);
  }
  await stakeOn(revealing, [side(0, true, 6000), side(1, false, 3000), side(2, true, 2000), side(3, true, 1200), side(6, false, 800)]);
  await until("the stakes", async () => (await market(ids[3])).stakes === 6 && (await market(revealing!)).stakes === 5, 120);
  // voter 2 hands the keeper the seals, so the keeper reveals them 48 hours after close
  for (const id of ids) {
    const s = sealsOf.get(String(id))![1];
    const r = await post(`/api/markets/${id}/seal`, { staker: s.staker.address, side: s.side, salt: s.salt });
    if (!r.ok && r.status !== 409) throw new Error(`seal: ${r.status} ${await r.text()}`);
  }
  log(`predict: opened ${ids.join(", ")} to settle and ${revealing} to sit in its reveal window`);

  await warpTo(closesAt + 1);
  // most stakers reveal; voter 6 never does on the first one, and its stake goes to the pool
  for (const [k, id] of ids.entries()) {
    const all = sealsOf.get(String(id))!;
    await reveal(id, all.filter((s, i) => i !== 1 && !(k === 0 && i === 5)));
  }
  await warpTo(closesAt + 48 * 3600 + 60);
  await until("the keeper's reveals", async () => {
    for (const id of ids) if ((await pub.readContract({ address: PREDICT, abi: predictAbi, functionName: "stakes", args: [id, V[1].address] }))[2] === 0) return false;
    return true;
  });
  for (const [k, id] of ids.entries()) {
    const qid = (await pub.readContract({ address: PREDICT, abi: predictAbi, functionName: "market", args: [id] })).questionId;
    await tx(await wallet(ANSWERER).writeContract({ address: REALITY, abi: realityAbi, functionName: "submitAnswer", args: [qid, toHex(SETTLED[k].answer, { size: 32 }), 0n], value: parseEther("0.01") }));
  }
  // markets left by an interrupted run whose seals are lost: answered YES too, so they settle (and refund) with the rest
  for (const m of await marketList()) {
    const id = BigInt(m.id);
    if (m.status !== "open" || ids.includes(id) || id === revealing) continue;
    const on = await pub.readContract({ address: PREDICT, abi: predictAbi, functionName: "market", args: [id] });
    if (on.questionId === toHex(0, { size: 32 }) || on.resolvesAt > (await chainNow())) continue;
    await wallet(ANSWERER)
      .writeContract({ address: REALITY, abi: realityAbi, functionName: "submitAnswer", args: [on.questionId, toHex(1, { size: 32 }), 0n], value: parseEther("0.01") })
      .then(tx)
      .catch(() => null);
  }
  await warpTo(settleAt);
  await until("the keeper's settles", async () => {
    for (const id of ids) if ((await market(id)).status === "open") return false;
    return true;
  });
  for (const id of ids) settledIds.push(`${id} (${(await market(id)).status})`);
  // a winner and the opener take their share on the first one; the rest is left to claim on the page
  const firstWinner = sealsOf.get(String(ids[0]))![0].staker;
  await tx(await wallet(firstWinner).writeContract({ address: PREDICT, abi: predictAbi, functionName: "claim", args: [ids[0]] }));
  await tx(await wallet(opener).writeContract({ address: PREDICT, abi: predictAbi, functionName: "claimLock", args: [ids[0]] }));
  log(`predict: settled ${settledIds.join(", ")}`);

  // fixed polls: asked, answered, then their hour passes
  const fixedIds: bigint[] = [];
  for (const [i, p] of FIXED.entries()) {
    const id = await ask(p, ASKERS[i % ASKERS.length]);
    await answer(id, p);
    fixedIds.push(id);
  }
  await warpTo((await chainNow()) + 3661);
  await until("the finalizer", async () => {
    for (const id of fixedIds) if ((await (await app(`/api/polls/${id}`)).json()).status !== "final") return false;
    return true;
  }, 300);
  fixedMade = fixedIds.length;
  log(`polls: ${fixedMade} fixed (${fixedIds.join(", ")})`);

  // the reveal-window market has closed; two of its five reveal now
  await reveal(revealing, sealsOf.get(String(revealing))!.slice(0, 2));
}

// ======================================================================= no warps from here on
// open polls
const openNow = (await (await app("/api/polls?status=open&limit=100")).json()).polls.length as number;
let openMade = 0;
if (openNow >= OPEN.length) {
  log(`polls: ${openNow} open already, skipped`);
} else {
  for (const [i, p] of OPEN.entries()) {
    const id = await ask(p, ASKERS[i % ASKERS.length]);
    await answer(id, p);
    openMade++;
  }
  log(`polls: ${openMade} open`);
}

// one open poll with enough tagged answers (20+ per group) for the region and age breakdowns
const CROWD = VOTERS.concat(Array.from({ length: 70 }, (_, i) => acct(30 + i)));
const crowdQ = "Which matters most to you when you pick a phone?";
const openList = (await (await app("/api/polls?status=open&limit=100")).json()).polls as { content: { questions: Q[] } | null }[];
let crowdAnswers = 0;
if (openList.some((p) => p.content?.questions[0]?.q === crowdQ)) {
  log("polls: crowd poll there already, skipped");
} else {
  // ZC before the ask block; answers are signatures, so these wallets need no ETH
  await rpc("anvil_impersonateAccount", [POOL_MANAGER]);
  for (const v of CROWD.slice(VOTERS.length)) await give(ZC, v.address, parseUnits("3000", 18));
  await rpc("anvil_stopImpersonatingAccount", [POOL_MANAGER]);
  const p: Poll = { topic: "Other", questions: [{ q: crowdQ, options: ["Battery life", "Camera", "Price", "Size", "Brand"] }], breadth: 100, priority: 0, hours: 7 * 24, answers: 0 };
  const id = await ask(p, ASKERS[1]);
  await until(`poll ${id} indexed`, async () => (await app(`/api/polls/${id}`)).ok, 120);
  // most of the crowd in two regions and two age groups, so those groups pass 20
  const regions = ["Europe", "North America", "Asia", ...REGIONS];
  const ages = ["25 to 34", "35 to 44", ...AGES];
  for (const [i, v] of CROWD.entries()) {
    const choices = [rand() < 0.35 ? 0 : Math.floor(rand() * 5)];
    const region = i % 3 === 2 ? pick(regions) : regions[i % 2];
    const age = i % 4 === 3 ? pick(ages) : ages[i % 2];
    const s = salt();
    const signature = await wallet(v).signTypedData({ domain, types, primaryType: "Answer", message: { pollId: id, choices, tagsHash: tagsHash(region, age), salt: s } });
    const res = await post("/api/answer", { pollId: String(id), voter: v.address, choices, region, age, salt: s, signature });
    if (res.ok) crowdAnswers++;
  }
  log(`polls: crowd poll ${id} with ${crowdAnswers} tagged answers`);
}

// open markets taking stakes
const openMarkets = (await (await app("/api/markets")).json()).markets.filter((m: { status: string; closesAt?: number }) => m.status === "open").length as number;
const openMarketIds: bigint[] = [];
if (openMarkets >= 5) {
  log(`predict: ${openMarkets} open markets already, skipped`);
} else {
  const t = await chainNow();
  const ev1 = await openEvent(ASKERS[0], "Will Ethereum's gas limit be raised above 100 million before 2027?", "Crypto", t + 4 * DAY, t + 30 * DAY, parseEther("0.02"));
  const ev2 = await openEvent(ASKERS[1], "Will a film made mostly with AI win a major festival prize in 2027?", "Culture", t + 9 * DAY, t + 120 * DAY);
  const ev3 = await openEvent(ASKERS[2], "Will the UK hold a general election before July 2027?", "Politics", t + 6 * DAY, t + 270 * DAY);
  const [, ethNow] = await pub.readContract({ address: ETH_USD, abi: [{ type: "function", name: "latestRoundData", stateMutability: "view", inputs: [], outputs: [{ type: "uint80" }, { type: "int256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint80" }] }] as const, functionName: "latestRoundData" });
  const eth = Math.round(Number(ethNow) / 1e8 / 100) * 100 + 300;
  const pr1 = await openPrice(ASKERS[0], FEEDS["ETH/USD"] as Address, eth, t + 2 * DAY, t + 7 * DAY);
  const pr2 = await openPrice(ASKERS[2], FEEDS["BTC/USD"] as Address, 150000, t + 5 * DAY, t + 21 * DAY);
  await stakeOn(ev1, [side(0, true, 5000), side(3, false, 1200), side(7, true, 700), side(9, true, 2000)]);
  await stakeOn(ev2, [side(1, false, 3000), side(4, true, 450)]);
  await stakeOn(ev3, [side(2, true, 1500), side(5, false, 1500), side(8, true, 600), side(10, false, 4000), side(11, true, 300)]);
  await stakeOn(pr1, [side(0, true, 9000), side(2, false, 6000), side(6, true, 1000)]);
  await stakeOn(pr2, [side(3, false, 2500)]);
  // one seal handed to the keeper, as the page offers
  const s = sealsOf.get(String(ev1))![0];
  await post(`/api/markets/${ev1}/seal`, { staker: s.staker.address, side: s.side, salt: s.salt });
  openMarketIds.push(ev1, ev2, ev3, pr1, pr2);
  await until("the open markets", async () => (await market(pr2)).stakes === 1, 120);
  log(`predict: open ${openMarketIds.join(", ")}`);
}

// public profiles for the forecasters and the askers, and voter 3 says it is an agent
for (const who of [...V.slice(0, 5), ...ASKERS]) {
  const at = Math.floor(Date.now() / 1000);
  const signature = await wallet(who).signMessage({ message: profileMessage(who.address, true, at) });
  await post("/api/profile", { address: who.address, public: true, at, signature });
}
const agents = (await (await app("/api/agents")).json()).agents as { address: string }[];
if (!agents.some((a) => a.address === V[2].address.toLowerCase())) {
  const at = Math.floor(Date.now() / 1000);
  const message = { name: "Halide Forecaster", url: "https://example.com/halide", active: true, at: BigInt(at) };
  const signature = await wallet(V[2]).signTypedData({ domain, types: agentTypes, primaryType: "Agent", message });
  const r = await post("/api/agents", { address: V[2].address, name: message.name, url: message.url, active: true, at, signature });
  if (!r.ok) log(`agent: ${r.status} ${await r.text()}`);
}

log("\nsummary");
log(`  realm: ${launched} launched, ${trades} trades`);
log(`  predict: settled ${settledIds.join(", ") || "none this run"}; reveal window ${revealing ?? "none this run"}; open ${openMarketIds.join(", ") || "none this run"}`);
log(`  polls: ${fixedMade} fixed, ${openMade} open`);
log(`  public forecasters: ${V.slice(0, 5).map((v) => v.address).join(", ")} (agent: ${V[2].address})`);
