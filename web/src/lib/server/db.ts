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

// on globalThis so the background loops and the route handlers share one copy in dev
export type AnswerRow = { poll_id: string; voter: Address; choices: number[]; region: string; age: string; salt: string; signature: string };

const g = globalThis as typeof globalThis & {
  silverchatMem?: { drafts: Map<string, string>; polls: Map<string, PollRow>; answers: Map<string, AnswerRow>; kv: Map<string, string> };
};
const mem = (g.silverchatMem ??= { drafts: new Map(), polls: new Map(), answers: new Map(), kv: new Map() });

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
       create table if not exists kv (key text primary key, value text not null);`,
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
  async setFinalized(id: string, resultRoot: string, rewardRoot: string, rewardTotal: string, tx: string) {
    await init();
    const f = { status: "final" as const, result_root: resultRoot, reward_root: rewardRoot, reward_total: rewardTotal, finalize_tx: tx };
    if (!pool) return void Object.assign(mem.polls.get(id) ?? {}, f);
    await pool.query(
      `update polls set status = 'final', result_root = $2, reward_root = $3, reward_total = $4, finalize_tx = $5 where id = $1`,
      [id, resultRoot, rewardRoot, rewardTotal, tx],
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
        .filter((p) => !status || p.status === status)
        .sort((a, b) => Number(BigInt(b.id) - BigInt(a.id)))
        .slice(0, limit)
        .map((p) => ({ ...p, answers: count(p.id) }));
    }
    const cols = `p.*, (select count(*) from answers a where a.poll_id = p.id)::int as answers`;
    const r = status
      ? await pool.query(`select ${cols} from polls p where status = $1 order by id desc limit $2`, [status, limit])
      : await pool.query(`select ${cols} from polls p order by id desc limit $1`, [limit]);
    return r.rows.map(text);
  },

  /** False when this wallet already answered this poll. Answers never change. */
  async addAnswer(a: AnswerRow) {
    await init();
    if (!pool) {
      const k = `${a.poll_id}:${a.voter}`;
      if (mem.answers.has(k)) return false;
      mem.answers.set(k, a);
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
