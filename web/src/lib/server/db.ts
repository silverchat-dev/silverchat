import "server-only";

import { Pool } from "pg";

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
};

// on globalThis so the background loops and the route handlers share one copy in dev
const g = globalThis as typeof globalThis & { silverchatMem?: { drafts: Map<string, string>; polls: Map<string, PollRow>; kv: Map<string, string> } };
const mem = (g.silverchatMem ??= { drafts: new Map(), polls: new Map(), kv: new Map() });

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
       create table if not exists kv (key text primary key, value text not null);`,
    )
    .then(() => undefined);
  return ready;
}

const text = (r: PollRow) => ({ ...r, id: String(r.id), cost: String(r.cost), block: String(r.block), closes_at: Number(r.closes_at) });

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

  async setFinalized(id: string, resultRoot: string, rewardRoot: string, rewardTotal: string) {
    await init();
    if (!pool) return void Object.assign(mem.polls.get(id) ?? {}, { status: "final", result_root: resultRoot, reward_root: rewardRoot, reward_total: rewardTotal });
    await pool.query(`update polls set status = 'final', result_root = $2, reward_root = $3, reward_total = $4 where id = $1`, [id, resultRoot, rewardRoot, rewardTotal]);
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
      return [...mem.polls.values()]
        .filter((p) => !status || p.status === status)
        .sort((a, b) => Number(BigInt(b.id) - BigInt(a.id)))
        .slice(0, limit);
    }
    const r = status
      ? await pool.query(`select * from polls where status = $1 order by id desc limit $2`, [status, limit])
      : await pool.query(`select * from polls order by id desc limit $1`, [limit]);
    return r.rows.map(text);
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
