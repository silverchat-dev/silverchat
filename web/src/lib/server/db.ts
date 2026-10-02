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
});
mem.profiles ??= new Map();
mem.markets ??= new Map();
mem.stakes ??= new Map();
mem.seals ??= new Map();

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
         market_id numeric not null, staker text not null, side int not null, salt text not null, primary key (market_id, staker));`,
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
