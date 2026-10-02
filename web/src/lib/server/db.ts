import "server-only";

import { Pool } from "pg";
import type { Address } from "viem";

import type { Tally } from "@/lib/algorithm";

/**
 * Postgres when DATABASE_URL is set (Railway), in-memory otherwise (local dev).
 * Big numbers are kept as decimal strings.
 */
const url = process.env.DATABASE_URL;
// Railway's private network and a local database speak plain TCP; anything else goes over TLS
const plain = url && /railway\.internal|localhost|127\.0\.0\.1/.test(url);
const pool = url ? new Pool({ connectionString: url, max: 4, ssl: plain ? undefined : { rejectUnauthorized: false } }) : null;

/** Polls taken off the site by id, comma-separated. They stay on-chain and are fixed and paid like any other. */
const HIDDEN = (process.env.HIDDEN_POLLS ?? "").split(",").map((s) => s.trim()).filter((s) => /^\d{1,20}$/.test(s));
export const isHidden = (id: string) => HIDDEN.includes(id);

export type PollRow = {
  id: string;
  hash: string;
  content: string | null;
  asker: string;
  breadth: number;
  priority: number;
  cost: string;
  closes_at: number;
  block: string;
  tx: string;
  log_index: number;
  min_hold_zc: string;
  min_hold_sc: string | null;
  status: "open" | "final" | "refunded";
  result_root: string | null;
  reward_root: string | null;
  reward_total: string | null;
  seed?: string | null;
  seed_block?: string | null;
  tally?: Tally | null;
  finalize_tx?: string | null;
  finalize_at?: number | null;
  answers?: number;
};

export type Ledger = { status: PollRow["status"]; cost: string; reward_total: string | null; block: string; finalize_at: number | null };

// on globalThis so the background loops and the route handlers share one copy in dev
export type AnswerRow = { poll_id: string; voter: Address; choices: number[]; region: string; age: string; salt: string; signature: string; at?: number };

const g = globalThis as typeof globalThis & {
  silverchatMem?: {
    drafts: Map<string, string>;
    polls: Map<string, PollRow>;
    answers: Map<string, AnswerRow>;
    kv: Map<string, string>;
    profiles: Map<string, Profile>;
    markets: Map<string, MarketRow>;
    stakes: Map<string, StakeRow>;
    seals: Map<string, SealRow>;
    realmTokens: Map<string, RealmTokenRow>;
    realmTrades: Map<string, RealmTradeRow>;
    realmBurns: Map<string, RealmBurnRow>;
    realmImages: Map<string, { type: string; data: Buffer; at: number }>;
  };
};
const mem = (g.silverchatMem ??= {
  drafts: new Map(),
  polls: new Map(),
  answers: new Map(),
  kv: new Map(),
  profiles: new Map(),
  markets: new Map(),
  stakes: new Map(),
  seals: new Map(),
  realmTokens: new Map(),
  realmTrades: new Map(),
  realmBurns: new Map(),
  realmImages: new Map(),
});
mem.profiles ??= new Map();
mem.markets ??= new Map();
mem.stakes ??= new Map();
mem.seals ??= new Map();
mem.realmTokens ??= new Map();
mem.realmTrades ??= new Map();
mem.realmBurns ??= new Map();
mem.realmImages ??= new Map();

/** A token launched on SilverRealm, as its logs said. */
export type RealmTokenRow = {
  token: string;
  realm: string;
  base: string;
  fee_ppm: number;
  pool_id: string;
  opening_tick: number;
  name: string | null;
  symbol: string | null;
  uri: string | null;
  sc_burned: string | null;
  dev_buy: string | null;
  description: string | null;
  website: string | null;
  x: string | null;
  image: string | null;
  graduated_at: number | null;
  block: string;
  tx: string;
  at: number;
};
/** One swap on a SilverRealm pool, keyed by where its log sits, so reading a block twice adds nothing. */
export type RealmTradeRow = {
  id: string;
  pool_id: string;
  trader: string;
  buy: boolean;
  amount_in: string;
  amount_out: string;
  fee: string;
  block: string;
  at: number;
  // what one base coin was worth in dollars when the trade was indexed
  base_usd: number | null;
};
export type RealmFeedRow = Pick<RealmTokenRow, "token" | "base" | "name" | "symbol" | "uri" | "image" | "description"> & {
  kind: "trade" | "launch";
  who: string;
  buy: boolean | null;
  // base coins in or out of the pool, before the fee
  base_amount: string | null;
  base_usd: number | null;
  at: number;
};
export type RealmBurnRow = { id: string; base: string; amount: string; sc_burned: string; zc_burned: string; block: string; at: number };
/**
 * A launch with what its trades add up to. `p24_*` is the last trade at or before a day ago, so the price then can be
 * read from it; null when there was none (the price was still the opening one).
 */
export type RealmTokenStats = RealmTokenRow & {
  trades: number;
  fees: string;
  volume_usd: number;
  trades_24h: number;
  volume_24h: number;
  last_trade_at: number | null;
  p24_buy: boolean | null;
  p24_in: string | null;
  p24_out: string | null;
  p24_fee: string | null;
};

/** A Predict market as SilverPredict holds it, plus what its logs said when it opened. Status 1 open, 2 yes, 3 no, 4 void. */
export type MarketRow = {
  id: string;
  kind: number;
  opener: string;
  question: string | null;
  feed: string | null;
  threshold: string | null;
  closes_at: number;
  resolves_at: number;
  question_id: string | null;
  arbitrator: string | null;
  min_bond: string | null;
  lock: string;
  pool: string;
  yes: string;
  no: string;
  payout: string;
  status: number;
  refund: boolean;
  invalid: boolean;
  lock_claimed: boolean;
  block: string;
  tx: string;
  stakes?: number;
};
export type StakeRow = { market_id: string; staker: string; amount: string; commitment: string; side: number; claimed: boolean };
/** The sealed side a staker handed the keeper. Never served by any route. */
export type SealRow = { market_id: string; staker: string; side: number; salt: string };

const MARKET_COLS = ["kind", "opener", "question", "feed", "threshold", "closes_at", "resolves_at", "question_id", "arbitrator", "min_bond", "lock", "pool", "yes", "no", "payout", "status", "refund", "invalid", "lock_claimed", "block", "tx"] as const;

const market = (r: MarketRow): MarketRow => ({
  ...r,
  id: String(r.id),
  threshold: r.threshold == null ? null : String(r.threshold),
  min_bond: r.min_bond == null ? null : String(r.min_bond),
  closes_at: Number(r.closes_at),
  resolves_at: Number(r.resolves_at),
  lock: String(r.lock),
  pool: String(r.pool),
  yes: String(r.yes),
  no: String(r.no),
  payout: String(r.payout),
  block: String(r.block),
});

/** A wallet's public profile switch and the time of the signature that last set it. */
export type Profile = { public: boolean; signed_at: number };

let ready: Promise<void> | null = null;
function init() {
  if (!pool) return Promise.resolve();
  ready ??= pool
    .query(
      `create table if not exists drafts (hash text primary key, content text not null, created_at timestamptz not null default now());
       create table if not exists polls (
         id numeric primary key, hash text not null, content text, asker text not null, breadth int not null, priority int not null,
         cost numeric not null, closes_at bigint not null, block numeric not null, tx text not null, log_index int not null,
         min_hold_zc numeric not null, min_hold_sc numeric, status text not null default 'open',
         result_root text, reward_root text, reward_total numeric);
       create index if not exists polls_hash on polls (hash);
       alter table polls add column if not exists seed text;
       alter table polls add column if not exists seed_block numeric;
       alter table polls add column if not exists tally jsonb;
       alter table polls add column if not exists finalize_tx text;
       alter table polls add column if not exists finalize_at bigint;
       create table if not exists answers (
         poll_id numeric not null, voter text not null, choices jsonb not null, region text not null, age text not null,
         salt text not null, signature text not null, created_at timestamptz not null default now(), primary key (poll_id, voter));
       create index if not exists answers_voter on answers (voter);
       create table if not exists kv (key text primary key, value text not null);
       create table if not exists profiles (address text primary key, public boolean not null, signed_at bigint not null);
       create table if not exists markets (
         id numeric primary key, kind int not null, opener text not null, question text, feed text, threshold numeric,
         closes_at bigint not null, resolves_at bigint not null, question_id text, arbitrator text, min_bond numeric,
         lock numeric not null, pool numeric not null default 0, yes numeric not null default 0, no numeric not null default 0,
         payout numeric not null default 0, status int not null default 1, refund boolean not null default false,
         invalid boolean not null default false, lock_claimed boolean not null default false, block numeric not null, tx text not null);
       create table if not exists stakes (
         market_id numeric not null, staker text not null, amount numeric not null, commitment text not null,
         side int not null default 0, claimed boolean not null default false, primary key (market_id, staker));
       create table if not exists seals (
         market_id numeric not null, staker text not null, side int not null, salt text not null, primary key (market_id, staker));
       create table if not exists realm_tokens (
         token text primary key, realm text not null, base text not null, fee_ppm int not null, pool_id text not null,
         opening_tick int not null, name text, symbol text, uri text, sc_burned numeric, dev_buy numeric,
         block numeric not null, tx text not null, at bigint not null);
       create index if not exists realm_tokens_realm on realm_tokens (realm);
       create table if not exists realm_trades (
         id text primary key, pool_id text not null, trader text not null, buy boolean not null, amount_in numeric not null,
         amount_out numeric not null, fee numeric not null, block numeric not null, at bigint not null);
       create index if not exists realm_trades_pool on realm_trades (pool_id, block desc);
       create index if not exists realm_trades_block on realm_trades (block desc);
       create index if not exists realm_tokens_at on realm_tokens (at desc);
       create table if not exists realm_burns (
         id text primary key, base text not null, amount numeric not null, sc_burned numeric not null,
         zc_burned numeric not null, block numeric not null, at bigint not null);
       alter table realm_tokens add column if not exists description text;
       alter table realm_tokens add column if not exists website text;
       alter table realm_tokens add column if not exists x text;
       alter table realm_tokens add column if not exists image text;
       alter table realm_tokens add column if not exists graduated_at bigint;
       alter table realm_trades add column if not exists base_usd double precision;
       create table if not exists realm_images (
         hash text primary key, type text not null, data bytea not null, created_at timestamptz not null default now());`,
    )
    .then(() => undefined);
  return ready;
}

const text = (r: PollRow) => ({
  ...r,
  id: String(r.id),
  cost: String(r.cost),
  block: String(r.block),
  closes_at: Number(r.closes_at),
  seed_block: r.seed_block == null ? null : String(r.seed_block),
  finalize_at: r.finalize_at == null ? null : Number(r.finalize_at),
});

export const db = {
  async saveDraft(hash: string, content: string) {
    await init();
    if (!pool) {
      mem.drafts.set(hash, content);
      for (const p of mem.polls.values()) if (p.hash === hash && !p.content) p.content = content;
      return;
    }
    await pool.query(`insert into drafts (hash, content) values ($1, $2) on conflict do nothing`, [hash, content]);
    await pool.query(`update polls set content = $2 where hash = $1 and content is null`, [hash, content]);
  },

  /** Drafts nobody paid for within a day are dropped. */
  async pruneDrafts() {
    await init();
    if (!pool) return;
    await pool.query(`delete from drafts d where created_at < now() - interval '1 day' and not exists (select 1 from polls p where p.hash = d.hash)`);
  },

  /** Insert or overwrite the row for an `Asked` log; a reorg that moved it gets the new values. */
  async upsertAsked(row: Omit<PollRow, "content" | "status" | "result_root" | "reward_root" | "reward_total">) {
    await init();
    if (!pool) {
      const old = mem.polls.get(row.id);
      // the eligibility minimums are fixed the first time a given tx is seen
      const same = old?.tx === row.tx;
      mem.polls.set(row.id, {
        status: "open",
        result_root: null,
        reward_root: null,
        reward_total: null,
        ...old,
        ...row,
        min_hold_zc: same ? old.min_hold_zc : row.min_hold_zc,
        min_hold_sc: same ? old.min_hold_sc : row.min_hold_sc,
        content: mem.drafts.get(row.hash) ?? null,
      });
      return;
    }
    await pool.query(
      `insert into polls (id, hash, content, asker, breadth, priority, cost, closes_at, block, tx, log_index, min_hold_zc, min_hold_sc)
       values ($1, $2, (select content from drafts where hash = $2), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       on conflict (id) do update set hash = excluded.hash, content = excluded.content, asker = excluded.asker, breadth = excluded.breadth,
         priority = excluded.priority, cost = excluded.cost, closes_at = excluded.closes_at, block = excluded.block, tx = excluded.tx,
         log_index = excluded.log_index,
         min_hold_zc = case when polls.tx = excluded.tx then polls.min_hold_zc else excluded.min_hold_zc end,
         min_hold_sc = case when polls.tx = excluded.tx then polls.min_hold_sc else excluded.min_hold_sc end`,
      [row.id, row.hash, row.asker, row.breadth, row.priority, row.cost, row.closes_at, row.block, row.tx, row.log_index, row.min_hold_zc, row.min_hold_sc],
    );
  },

  /** From the Finalized log: the chain's roots and tx win over whatever the finalizer saved before sending. */
  async setFinalized(id: string, resultRoot: string, rewardRoot: string, rewardTotal: string, tx: string, at: number) {
    await init();
    const f = { status: "final" as const, result_root: resultRoot, reward_root: rewardRoot, reward_total: rewardTotal, finalize_tx: tx };
    if (!pool) {
      const p = mem.polls.get(id);
      return void (p && Object.assign(p, f, { finalize_at: p.finalize_at ?? at }));
    }
    await pool.query(
      `update polls set status = 'final', result_root = $2, reward_root = $3, reward_total = $4, finalize_tx = $5, finalize_at = coalesce(finalize_at, $6) where id = $1`,
      [id, resultRoot, rewardRoot, rewardTotal, tx, at],
    );
  },

  /** Open polls past their close, not sent in the last 15 minutes. */
  async due(now: number): Promise<PollRow[]> {
    await init();
    const stale = Math.floor(Date.now() / 1000) - 15 * 60;
    if (!pool) {
      return [...mem.polls.values()].filter((p) => p.status === "open" && p.content && p.closes_at < now && !(p.finalize_at && p.finalize_at > stale));
    }
    const r = await pool.query(
      // a poll whose question never reached us is left for the asker's 7-day refund, and never holds up the others
      `select * from polls where status = 'open' and content is not null and closes_at < $1 and (finalize_at is null or finalize_at < $2) order by id limit 20`,
      [now, stale],
    );
    return r.rows.map(text);
  },

  /**
   * Take a due poll for finalizing, atomically. From here no answer can be added (see addAnswer), and a second worker
   * gets false. Must happen before the answers are read.
   */
  async claimFinalizing(id: string) {
    await init();
    const now = Math.floor(Date.now() / 1000);
    const stale = now - 15 * 60;
    if (!pool) {
      const p = mem.polls.get(id);
      if (!p || p.status !== "open" || (p.finalize_at && p.finalize_at > stale)) return false;
      p.finalize_at = now;
      return true;
    }
    const r = await pool.query(
      `update polls set finalize_at = $2 where id = $1 and status = 'open' and (finalize_at is null or finalize_at < $3)`,
      [id, now, stale],
    );
    return r.rowCount === 1;
  },

  /** Saved before the finalize transaction is sent, so a restart does not send it twice. */
  async setFinalizing(id: string, f: { seed: string; seed_block: string; tally: Tally; result_root: string; reward_root: string; reward_total: string; finalize_tx: string }) {
    await init();
    const at = Math.floor(Date.now() / 1000);
    if (!pool) return void Object.assign(mem.polls.get(id) ?? {}, { ...f, finalize_at: at });
    await pool.query(
      `update polls set seed = $2, seed_block = $3, tally = $4, result_root = $5, reward_root = $6, reward_total = $7, finalize_tx = $8, finalize_at = $9 where id = $1`,
      [id, f.seed, f.seed_block, JSON.stringify(f.tally), f.result_root, f.reward_root, f.reward_total, f.finalize_tx, at],
    );
  },

  /** How many polls with a question closed before `ts` and are still not fixed, retries or not. */
  async overdue(ts: number): Promise<number> {
    await init();
    if (!pool) return [...mem.polls.values()].filter((p) => p.status === "open" && p.content && p.closes_at < ts).length;
    const r = await pool.query(`select count(*)::int as n from polls where status = 'open' and content is not null and closes_at < $1`, [ts]);
    return r.rows[0].n;
  },

  /** Final polls from the last 90 days that `voter` answered. */
  async answeredFinal(voter: string, since: number): Promise<PollRow[]> {
    await init();
    if (!pool) {
      return [...mem.polls.values()].filter((p) => p.status === "final" && (p.finalize_at ?? 0) >= since && mem.answers.has(`${p.id}:${voter}`));
    }
    const r = await pool.query(
      `select p.* from polls p join answers a on a.poll_id = p.id where a.voter = $1 and p.status = 'final' and p.finalize_at >= $2 order by p.id desc`,
      [voter, since],
    );
    return r.rows.map(text);
  },

  async setRefunded(id: string) {
    await init();
    if (!pool) return void Object.assign(mem.polls.get(id) ?? {}, { status: "refunded" });
    await pool.query(`update polls set status = 'refunded' where id = $1`, [id]);
  },

  async poll(id: string): Promise<PollRow | null> {
    await init();
    if (!pool) return mem.polls.get(id) ?? null;
    const r = await pool.query(`select * from polls where id = $1`, [id]);
    return r.rows[0] ? text(r.rows[0]) : null;
  },

  async polls(limit: number, status?: PollRow["status"]): Promise<PollRow[]> {
    await init();
    if (!pool) {
      const count = (id: string) => [...mem.answers.values()].filter((a) => a.poll_id === id).length;
      return [...mem.polls.values()]
        .filter((p) => (!status || p.status === status) && !isHidden(p.id))
        .sort((a, b) => (status === "final" ? (b.finalize_at ?? 0) - (a.finalize_at ?? 0) : 0) || Number(BigInt(b.id) - BigInt(a.id)))
        .slice(0, limit)
        .map((p) => ({ ...p, answers: count(p.id) }));
    }
    const cols = `p.*, (select count(*) from answers a where a.poll_id = p.id)::int as answers`;
    // fixed results come newest fixed first: a long poll asked early can be fixed after short ones asked later
    const order = status === "final" ? "finalize_at desc nulls last, id desc" : "id desc";
    const r = await pool.query(`select ${cols} from polls p where ($1::text is null or status = $1) and id <> all($2::numeric[]) order by ${order} limit $3`, [
      status ?? null,
      HIDDEN,
      limit,
    ]);
    return r.rows.map(text);
  },

  /** False when this wallet already answered this poll. Answers never change. */
  async addAnswer(a: AnswerRow) {
    await init();
    if (!pool) {
      const k = `${a.poll_id}:${a.voter}`;
      if (mem.answers.has(k)) return false;
      mem.answers.set(k, { ...a, at: Date.now() });
      return true;
    }
    // only while the poll is still open in the database, so nothing slips in after the finalizer has read the answers
    const r = await pool.query(
      `insert into answers (poll_id, voter, choices, region, age, salt, signature)
       select $1, $2, $3, $4, $5, $6, $7 where exists (select 1 from polls where id = $1 and status = 'open' and finalize_at is null)
       on conflict do nothing`,
      [a.poll_id, a.voter, JSON.stringify(a.choices), a.region, a.age, a.salt, a.signature],
    );
    return r.rowCount === 1;
  },

  /**
   * Every poll's money fields and when it was asked and fixed, the total answer count and the answers of the last 24
   * hours, hidden polls included (they are paid like any other).
   */
  async ledger(): Promise<{ polls: Ledger[]; answers: number; dayAnswers: number }> {
    await init();
    if (!pool) {
      const since = Date.now() - 86_400_000;
      return {
        polls: [...mem.polls.values()].map((p) => ({ status: p.status, cost: p.cost, reward_total: p.reward_total, block: p.block, finalize_at: p.finalize_at ?? null })),
        answers: mem.answers.size,
        dayAnswers: [...mem.answers.values()].filter((a) => (a.at ?? 0) >= since).length,
      };
    }
    const [p, a] = await Promise.all([
      pool.query(`select status, cost::text as cost, reward_total::text as reward_total, block::text as block, finalize_at::float8 as finalize_at from polls`),
      pool.query(`select count(*)::int as n, (count(*) filter (where created_at > now() - interval '1 day'))::int as day from answers`),
    ]);
    return { polls: p.rows, answers: a.rows[0].n, dayAnswers: a.rows[0].day };
  },

  async answerCount(pollId: string) {
    await init();
    if (!pool) return [...mem.answers.values()].filter((a) => a.poll_id === pollId).length;
    const r = await pool.query(`select count(*)::int as n from answers where poll_id = $1`, [pollId]);
    return r.rows[0].n as number;
  },

  async answers(pollId: string): Promise<AnswerRow[]> {
    await init();
    if (!pool) return [...mem.answers.values()].filter((a) => a.poll_id === pollId);
    const r = await pool.query(`select * from answers where poll_id = $1`, [pollId]);
    return r.rows.map((a) => ({ ...a, poll_id: String(a.poll_id) }));
  },

  /** Polls asked by `address`, newest first, hidden ones left out. */
  async askedBy(address: string): Promise<PollRow[]> {
    await init();
    if (!pool) return [...mem.polls.values()].filter((p) => p.asker === address && !isHidden(p.id)).sort((a, b) => Number(BigInt(b.id) - BigInt(a.id)));
    const r = await pool.query(`select * from polls where asker = $1 and id <> all($2::numeric[]) order by id desc`, [address, HIDDEN]);
    return r.rows.map(text);
  },

  async profile(address: string): Promise<Profile | null> {
    await init();
    if (!pool) return mem.profiles.get(address) ?? null;
    const r = await pool.query(`select public, signed_at::float8 as signed_at from profiles where address = $1`, [address]);
    return r.rows[0] ?? null;
  },

  /** False when a signature at least as new already set it, so an old "show" cannot undo a later "hide". */
  async setProfile(address: string, on: boolean, at: number) {
    await init();
    if (!pool) {
      if ((mem.profiles.get(address)?.signed_at ?? -1) >= at) return false;
      mem.profiles.set(address, { public: on, signed_at: at });
      return true;
    }
    const r = await pool.query(
      `insert into profiles (address, public, signed_at) values ($1, $2, $3)
       on conflict (address) do update set public = excluded.public, signed_at = excluded.signed_at where profiles.signed_at < excluded.signed_at`,
      [address, on, at],
    );
    return r.rowCount === 1;
  },

  /** Insert or update the columns given for one market; a reorg that moved its log gets the new values. */
  async upsertMarket(id: string, fields: Partial<Omit<MarketRow, "id" | "stakes">>) {
    await init();
    if (!pool) {
      const old = mem.markets.get(id);
      if (!old && !("kind" in fields)) return void console.error(`[indexer] market ${id} has no Opened row yet`);
      mem.markets.set(id, { pool: "0", yes: "0", no: "0", payout: "0", status: 1, refund: false, invalid: false, lock_claimed: false, ...old, ...fields, id } as MarketRow);
      return;
    }
    const cols = MARKET_COLS.filter((c) => c in fields);
    if (!cols.length) return;
    const vals = cols.map((c) => fields[c]);
    // update first: Postgres checks NOT NULL on an insert before ON CONFLICT, and only the Opened log has every column
    const r = await pool.query(`update markets set ${cols.map((c, i) => `${c} = $${i + 2}`).join(", ")} where id = $1`, [id, ...vals]);
    if (r.rowCount) return;
    // a market whose Opened log was never read: skip it rather than stop the indexer for polls too
    if (!("kind" in fields)) return void console.error(`[indexer] market ${id} has no Opened row yet`);
    await pool.query(
      `insert into markets (id, ${cols.join(", ")}) values ($1, ${cols.map((_, i) => `$${i + 2}`).join(", ")}) on conflict (id) do nothing`,
      [id, ...vals],
    );
  },

  async markets(limit = 200): Promise<MarketRow[]> {
    await init();
    if (!pool) {
      const count = (id: string) => [...mem.stakes.values()].filter((x) => x.market_id === id).length;
      return [...mem.markets.values()]
        .sort((a, b) => Number(BigInt(b.id) - BigInt(a.id)))
        .slice(0, limit)
        .map((m) => ({ ...m, stakes: count(m.id) }));
    }
    const r = await pool.query(
      `select m.*, (select count(*) from stakes s where s.market_id = m.id)::int as stakes from markets m order by id desc limit $1`,
      [limit],
    );
    return r.rows.map(market);
  },

  async market(id: string): Promise<MarketRow | null> {
    await init();
    if (!pool) {
      const m = mem.markets.get(id);
      return m ? { ...m, stakes: [...mem.stakes.values()].filter((x) => x.market_id === id).length } : null;
    }
    const r = await pool.query(`select m.*, (select count(*) from stakes s where s.market_id = m.id)::int as stakes from markets m where id = $1`, [id]);
    return r.rows[0] ? market(r.rows[0]) : null;
  },

  /** Markets the keeper still has work on: open, or void on an invalid answer with the SC lock not yet sent. */
  async marketsToKeep(): Promise<MarketRow[]> {
    await init();
    if (!pool) return [...mem.markets.values()].filter((m) => m.status === 1 || (m.invalid && !m.lock_claimed));
    const r = await pool.query(`select * from markets where status = 1 or (invalid and not lock_claimed) order by id`);
    return r.rows.map(market);
  },

  async upsertStake(row: Omit<StakeRow, "side" | "claimed">) {
    await init();
    if (!pool) {
      const k = `${row.market_id}:${row.staker}`;
      mem.stakes.set(k, { side: 0, claimed: false, ...mem.stakes.get(k), ...row });
      return;
    }
    await pool.query(
      `insert into stakes (market_id, staker, amount, commitment) values ($1, $2, $3, $4)
       on conflict (market_id, staker) do update set amount = excluded.amount, commitment = excluded.commitment`,
      [row.market_id, row.staker, row.amount, row.commitment],
    );
  },

  async setStake(marketId: string, staker: string, fields: { side?: number; claimed?: boolean }) {
    await init();
    if (!pool) return void Object.assign(mem.stakes.get(`${marketId}:${staker}`) ?? {}, fields);
    if (fields.side !== undefined) await pool.query(`update stakes set side = $3 where market_id = $1 and staker = $2`, [marketId, staker, fields.side]);
    if (fields.claimed !== undefined) await pool.query(`update stakes set claimed = $3 where market_id = $1 and staker = $2`, [marketId, staker, fields.claimed]);
  },

  async saveSeal(row: SealRow) {
    await init();
    if (!pool) return void mem.seals.set(`${row.market_id}:${row.staker}`, row);
    await pool.query(
      // the route checked it against the chain just now; a newer seal (a stake moved by a reorg) replaces the old one
      `insert into seals (market_id, staker, side, salt) values ($1, $2, $3, $4)
       on conflict (market_id, staker) do update set side = excluded.side, salt = excluded.salt`,
      [row.market_id, row.staker, row.side, row.salt],
    );
  },

  /** Seals of stakes the chain still has sealed. */
  async sealsToReveal(marketId: string): Promise<SealRow[]> {
    await init();
    if (!pool) return [...mem.seals.values()].filter((x) => x.market_id === marketId && mem.stakes.get(`${x.market_id}:${x.staker}`)?.side === 0);
    const r = await pool.query(
      `select x.market_id::text, x.staker, x.side, x.salt from seals x join stakes s on s.market_id = x.market_id and s.staker = x.staker
       where x.market_id = $1 and s.side = 0`,
      [marketId],
    );
    return r.rows;
  },

  /** Insert or update the columns given for one launched token; Launched creates the row, the other logs fill it. */
  async upsertRealmToken(token: string, fields: Partial<Omit<RealmTokenRow, "token">>) {
    await init();
    if (!pool) {
      const old = mem.realmTokens.get(token);
      if (!old && !("realm" in fields)) return void console.error(`[indexer] realm token ${token} has no Launched row yet`);
      const empty = { name: null, symbol: null, uri: null, sc_burned: null, dev_buy: null, description: null, website: null, x: null, image: null, graduated_at: null };
      return void mem.realmTokens.set(token, { ...empty, ...old, ...fields, token } as RealmTokenRow);
    }
    const cols = Object.keys(fields);
    const vals = Object.values(fields);
    if ("realm" in fields) {
      await pool.query(
        `insert into realm_tokens (token, ${cols.join(", ")}) values ($1, ${cols.map((_, i) => `$${i + 2}`).join(", ")})
         on conflict (token) do update set ${cols.map((c) => `${c} = excluded.${c}`).join(", ")}`,
        [token, ...vals],
      );
      return;
    }
    const r = await pool.query(`update realm_tokens set ${cols.map((c, i) => `${c} = $${i + 2}`).join(", ")} where token = $1`, [token, ...vals]);
    if (r.rowCount === 0) console.error(`[indexer] realm token ${token} has no Launched row yet`);
  },

  async saveRealmTrade(row: RealmTradeRow) {
    await init();
    if (!pool) return void mem.realmTrades.set(row.id, row);
    await pool.query(
      `insert into realm_trades (id, pool_id, trader, buy, amount_in, amount_out, fee, block, at, base_usd) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       on conflict (id) do update set pool_id = excluded.pool_id, trader = excluded.trader, buy = excluded.buy,
         amount_in = excluded.amount_in, amount_out = excluded.amount_out, fee = excluded.fee, at = excluded.at,
         base_usd = coalesce(realm_trades.base_usd, excluded.base_usd)`,
      [row.id, row.pool_id, row.trader, row.buy, row.amount_in, row.amount_out, row.fee, row.block, row.at, row.base_usd],
    );
  },

  async saveRealmBurn(row: RealmBurnRow) {
    await init();
    if (!pool) return void mem.realmBurns.set(row.id, row);
    await pool.query(
      `insert into realm_burns (id, base, amount, sc_burned, zc_burned, block, at) values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (id) do update set base = excluded.base, amount = excluded.amount, sc_burned = excluded.sc_burned,
         zc_burned = excluded.zc_burned, at = excluded.at`,
      [row.id, row.base, row.amount, row.sc_burned, row.zc_burned, row.block, row.at],
    );
  },

  /** Launched tokens, newest first: all, one Realm's (`realm`), or one (`token`), with trade counts and fees. */
  async realmTokens(filter: { realm?: string; token?: string } = {}, limit = 100): Promise<RealmTokenStats[]> {
    await init();
    const day = Math.floor(Date.now() / 1000) - 86_400;
    const usdOf = (t: RealmTradeRow) => (Number(t.buy ? t.amount_in : t.amount_out) / 1e18) * (t.base_usd ?? 0);
    if (!pool) {
      const trades = [...mem.realmTrades.values()];
      const order = (t: RealmTradeRow) => t.id.split(":").map(Number);
      return [...mem.realmTokens.values()]
        .filter((x) => (!filter.realm || x.realm === filter.realm) && (!filter.token || x.token === filter.token))
        .sort((a, b) => b.at - a.at)
        .slice(0, limit)
        .map((x) => {
          const mine = trades.filter((t) => t.pool_id === x.pool_id).sort((a, b) => order(a)[0] - order(b)[0] || order(a)[1] - order(b)[1]);
          const recent = mine.filter((t) => t.at > day);
          const then = mine.filter((t) => t.at <= day).at(-1);
          return {
            ...x,
            trades: mine.length,
            fees: String(mine.reduce((s, t) => s + BigInt(t.fee), 0n)),
            volume_usd: mine.reduce((s, t) => s + usdOf(t), 0),
            trades_24h: recent.length,
            volume_24h: recent.reduce((s, t) => s + usdOf(t), 0),
            last_trade_at: mine.at(-1)?.at ?? null,
            p24_buy: then?.buy ?? null,
            p24_in: then?.amount_in ?? null,
            p24_out: then?.amount_out ?? null,
            p24_fee: then?.fee ?? null,
          };
        });
    }
    const where = filter.realm ? "where t.realm = $3" : filter.token ? "where t.token = $3" : "";
    // one pass over the trades of the tokens asked for, and the last trade before a day ago of each
    const r = await pool.query(
      `with t as (select * from realm_tokens t ${where} order by t.at desc limit $1),
       s as (
         select x.pool_id, count(*)::int as trades, sum(x.fee)::text as fees,
           sum(x.usd)::float8 as volume_usd, coalesce(sum(x.usd) filter (where x.at > $2), 0)::float8 as volume_24h,
           (count(*) filter (where x.at > $2))::int as trades_24h, max(x.at) as last_trade_at
         from (select pool_id, fee, at, (case when buy then amount_in else amount_out end) / 1e18 * coalesce(base_usd, 0) as usd
               from realm_trades where pool_id in (select pool_id from t)) x
         group by x.pool_id),
       p as (
         select distinct on (pool_id) pool_id, buy, amount_in::text, amount_out::text, fee::text from realm_trades
         where pool_id in (select pool_id from t) and at <= $2
         order by pool_id, block desc, split_part(id, ':', 2)::int desc)
       select t.*, t.sc_burned::text as sc_burned, t.dev_buy::text as dev_buy, t.block::text as block,
         coalesce(s.trades, 0) as trades, coalesce(s.fees, '0') as fees, coalesce(s.volume_usd, 0) as volume_usd,
         coalesce(s.trades_24h, 0) as trades_24h, coalesce(s.volume_24h, 0) as volume_24h, s.last_trade_at,
         p.buy as p24_buy, p.amount_in as p24_in, p.amount_out as p24_out, p.fee as p24_fee
       from t left join s on s.pool_id = t.pool_id left join p on p.pool_id = t.pool_id order by t.at desc`,
      where ? [limit, day, filter.realm ?? filter.token] : [limit, day],
    );
    const num = (v: unknown) => (v == null ? null : Number(v));
    return r.rows.map((x) => ({ ...x, at: Number(x.at), graduated_at: num(x.graduated_at), last_trade_at: num(x.last_trade_at) }));
  },

  /** The newest trades and launches across every SilverRealm token, newest first, for the board's ticker. */
  async realmFeed(limit = 30): Promise<RealmFeedRow[]> {
    await init();
    const launches = async (): Promise<RealmFeedRow[]> => {
      const rows = pool
        ? (await pool.query(`select token, realm, base, name, symbol, uri, image, description, at from realm_tokens order by at desc limit $1`, [limit])).rows
        : [...mem.realmTokens.values()].sort((a, b) => b.at - a.at).slice(0, limit);
      return rows.map((t) => ({ kind: "launch", who: t.realm, buy: null, base_amount: null, base_usd: null, ...pick(t), at: Number(t.at) }));
    };
    const pick = (t: Pick<RealmTokenRow, "token" | "base" | "name" | "symbol" | "uri" | "image" | "description">) =>
      ({ token: t.token, base: t.base, name: t.name, symbol: t.symbol, uri: t.uri, image: t.image, description: t.description });
    let trades: RealmFeedRow[];
    if (!pool) {
      const byPool = new Map([...mem.realmTokens.values()].map((t) => [t.pool_id, t]));
      const order = (t: RealmTradeRow) => t.id.split(":").map(Number);
      trades = [...mem.realmTrades.values()]
        .sort((a, b) => order(b)[0] - order(a)[0] || order(b)[1] - order(a)[1])
        .slice(0, limit)
        .flatMap((x) => {
          const t = byPool.get(x.pool_id);
          if (!t) return [];
          const base = x.buy ? BigInt(x.amount_in) - BigInt(x.fee) : BigInt(x.amount_out) + BigInt(x.fee);
          return [{ kind: "trade" as const, who: x.trader, buy: x.buy, base_amount: String(base), base_usd: x.base_usd, ...pick(t), at: x.at }];
        });
    } else {
      const r = await pool.query(
        `select x.trader as who, x.buy, (case when x.buy then x.amount_in - x.fee else x.amount_out + x.fee end)::text as base_amount,
           x.base_usd, x.at, t.token, t.base, t.name, t.symbol, t.uri, t.image, t.description
         from realm_trades x join realm_tokens t on t.pool_id = x.pool_id
         order by x.block desc, split_part(x.id, ':', 2)::int desc limit $1`,
        [limit],
      );
      trades = r.rows.map((x) => ({ kind: "trade", ...x, at: Number(x.at) }));
    }
    return [...trades, ...(await launches())].sort((a, b) => b.at - a.at).slice(0, limit);
  },

  /** The base coin of a SilverRealm pool, from its launch row. */
  async realmBaseOf(poolId: string): Promise<string | null> {
    await init();
    if (!pool) return [...mem.realmTokens.values()].find((t) => t.pool_id === poolId)?.base ?? null;
    return (await pool.query(`select base from realm_tokens where pool_id = $1`, [poolId])).rows[0]?.base ?? null;
  },

  /** Every trade of a pool, oldest first, for its chart. */
  async realmChartTrades(poolId: string, limit = 20_000): Promise<RealmTradeRow[]> {
    await init();
    if (!pool) {
      const order = (t: RealmTradeRow) => t.id.split(":").map(Number);
      return [...mem.realmTrades.values()].filter((t) => t.pool_id === poolId).sort((a, b) => order(a)[0] - order(b)[0] || order(a)[1] - order(b)[1]).slice(-limit);
    }
    const r = await pool.query(
      `select * from (select id, pool_id, trader, buy, amount_in::text, amount_out::text, fee::text, block::text, at, base_usd
         from realm_trades where pool_id = $1 order by block desc, split_part(id, ':', 2)::int desc limit $2) x
       order by block asc, split_part(id, ':', 2)::int asc`,
      [poolId, limit],
    );
    return r.rows.map((x) => ({ ...x, at: Number(x.at) }));
  },

  /** Tokens not graduated yet, with what the keeper needs to price their pools. */
  async realmUngraduated(): Promise<Pick<RealmTokenRow, "token" | "base" | "pool_id" | "opening_tick">[]> {
    await init();
    if (!pool) return [...mem.realmTokens.values()].filter((t) => t.graduated_at == null);
    return (await pool.query(`select token, base, pool_id, opening_tick from realm_tokens where graduated_at is null`)).rows;
  },

  /** Trades indexed without a dollar price (the lookup failed then), with their pool's base. */
  async realmTradesWithoutUsd(limit: number): Promise<{ id: string; block: string; base: string }[]> {
    await init();
    if (!pool) {
      return [...mem.realmTrades.values()]
        .filter((t) => t.base_usd === null)
        .slice(0, limit)
        .flatMap((t) => {
          const tok = [...mem.realmTokens.values()].find((x) => x.pool_id === t.pool_id);
          return tok ? [{ id: t.id, block: t.block, base: tok.base }] : [];
        });
    }
    const r = await pool.query(
      `select x.id, x.block::text, t.base from realm_trades x join realm_tokens t on t.pool_id = x.pool_id where x.base_usd is null limit $1`,
      [limit],
    );
    return r.rows;
  },

  async setRealmTradeUsd(id: string, usd: number) {
    await init();
    if (!pool) {
      const t = mem.realmTrades.get(id);
      if (t) t.base_usd = usd;
      return;
    }
    await pool.query(`update realm_trades set base_usd = $2 where id = $1`, [id, usd]);
  },

  async realmTrades(poolId: string, limit = 50): Promise<RealmTradeRow[]> {
    await init();
    // newest first: by block, then by the log's place in it (the id is "block:logIndex")
    const order = (t: RealmTradeRow) => t.id.split(":").map(Number);
    if (!pool) {
      return [...mem.realmTrades.values()]
        .filter((t) => t.pool_id === poolId)
        .sort((a, b) => order(b)[0] - order(a)[0] || order(b)[1] - order(a)[1])
        .slice(0, limit);
    }
    const r = await pool.query(
      `select id, pool_id, trader, buy, amount_in::text, amount_out::text, fee::text, block::text, at, base_usd from realm_trades
       where pool_id = $1 order by block desc, split_part(id, ':', 2)::int desc limit $2`,
      [poolId, limit],
    );
    return r.rows.map((x) => ({ ...x, at: Number(x.at) }));
  },

  /** An uploaded token image, stored under the sha-256 of its bytes, so the link to it can never show anything else. */
  async saveRealmImage(hash: string, type: string, data: Buffer) {
    await init();
    if (!pool) return void mem.realmImages.set(hash, { type, data, at: Date.now() });
    // sending the same image again counts as using it now, so a launch right after keeps it
    await pool.query(`insert into realm_images (hash, type, data) values ($1, $2, $3) on conflict (hash) do update set created_at = now()`, [hash, type, data]);
  },

  async realmImage(hash: string): Promise<{ type: string; data: Buffer } | null> {
    await init();
    if (!pool) return mem.realmImages.get(hash) ?? null;
    const r = await pool.query(`select type, data from realm_images where hash = $1`, [hash]);
    return r.rows[0] ?? null;
  },

  /** Images and metadata no launch used within a week are dropped; the week covers an indexer that fell behind. */
  async pruneRealmImages() {
    await init();
    if (!pool) return;
    // a launch keeps its metadata (the uri) and the image the metadata names
    await pool.query(
      `delete from realm_images i where created_at < now() - interval '7 days'
       and not exists (select 1 from realm_tokens t where t.uri like '%/' || i.hash or t.image like '%/' || i.hash)`,
    );
  },

  /** Everything SilverRealm has burned: the $5 of each launch and every converted fee. */
  async realmBurned(): Promise<{ sc: string; zc: string; launches: number }> {
    await init();
    if (!pool) {
      const burns = [...mem.realmBurns.values()];
      const tokens = [...mem.realmTokens.values()];
      const sc = burns.reduce((s, b) => s + BigInt(b.sc_burned), 0n) + tokens.reduce((s, x) => s + BigInt(x.sc_burned ?? "0"), 0n);
      return { sc: String(sc), zc: String(burns.reduce((s, b) => s + BigInt(b.zc_burned), 0n)), launches: tokens.length };
    }
    const r = await pool.query(
      `select (coalesce((select sum(sc_burned) from realm_burns), 0) + coalesce((select sum(sc_burned) from realm_tokens), 0))::text as sc,
         coalesce((select sum(zc_burned) from realm_burns), 0)::text as zc, (select count(*) from realm_tokens)::int as launches`,
    );
    return r.rows[0];
  },

  async get(key: string) {
    await init();
    if (!pool) return mem.kv.get(key) ?? null;
    const r = await pool.query(`select value from kv where key = $1`, [key]);
    return (r.rows[0]?.value as string | undefined) ?? null;
  },

  async set(key: string, value: string) {
    await init();
    if (!pool) return void mem.kv.set(key, value);
    await pool.query(`insert into kv (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value`, [key, value]);
  },
};
