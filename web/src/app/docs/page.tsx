import type { Metadata } from "next";
import Link from "next/link";

import { Page, PageHead, action, label, quiet } from "@/components/journal";
import { GROUP_MIN, MIN_HOLD_USD } from "@/lib/algorithm";
import { ADDR, BOOK_URL, chapter, EXPLORER, GITHUB_URL, ZERO, ZINC_LIVE } from "@/lib/config";
import { TOPICS } from "@/lib/content";
import { REFUSED } from "@/lib/moderation";
import { USD_PER_PERSON } from "@/lib/server/price";

export const metadata: Metadata = { title: "Docs · silverchat" };

const SECTIONS = [
  ["how", "How it works"],
  ["questions", "Questions"],
  ["book", "From the book"],
  ["contracts", "Contracts"],
  ["predict", "Predict"],
  ...(ADDR.realmFactory !== ZERO ? ([["realm", "SilverRealm"]] as const) : []),
  ["api", "API"],
  ["agents", "Agents"],
  ["trust", "Trust"],
] as const;

const BOOK: [string, string, number[], string][] = [
  ["Pay to poll", "Pay zipcoins to ask a large cross-section of people. More zipcoins, more people.", [27], "Ask, with breadth and priority, paid in $ZC."],
  ["Proofs", "Silverchat publishes proofs, so clients reject an update that breaks the rules.", [27], "Each result root goes on Ethereum. Your browser recounts it."],
  ["Algorithm hash", "A new algorithm hash only counts after a twenty-day delay.", [27], "SilverAlgorithm holds the hash of the rules file."],
  ["Anonymous answers", "Votes are anonymous. Results split by what people say about themselves.", [27], "Signed answers, recorded without addresses. Optional region and age."],
  ["Open clients", "An open API lets people write their own client and take their data with them.", [3, 8], "Open API and export. Build your own reader."],
  ["Predict", "Silverchat Predict lets people, or bots, bet on future events.", [27], "Stake ZC on YES or NO with a sealed side. Chainlink or Reality.eth settles it."],
  ["Reading the network", "The AI Emerald writes a broad report of what people say.", [10], "Not yet."],
];

export default function DocsPage() {
  const contracts: [string, string][] = [
    ["SilverAsk", ADDR.ask],
    ["SilverAlgorithm", ADDR.algorithm],
    ...(ADDR.predict !== ZERO ? ([["SilverPredict", ADDR.predict]] as [string, string][]) : []),
    ...(ADDR.realmFactory !== ZERO
      ? ([
          ["RealmFactory", ADDR.realmFactory],
          ["RealmHook", ADDR.realmHook],
          ["RealmBurner", ADDR.realmBurner],
        ] as [string, string][])
      : []),
    ["$ZC", ADDR.zc],
    ["$SC", ADDR.sc],
  ];

  return (
    <Page>
      <PageHead
        stop="library"
        title="Docs"
        art={<TerminalArt />}
        aside={
          <>
            <a href="#api" className={`${action} min-h-11`}>
              Go to the API
            </a>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className={`font-mono text-[13px] ${quiet}`}>
              Source on GitHub
            </a>
          </>
        }
      >
        Silverchat is the polling network from{" "}
        <a href={BOOK_URL} target="_blank" rel="noreferrer" className={quiet}>
          Snowmoon
        </a>
        , a novel by Vitalik Buterin, built on Ethereum. You pay $ZC to ask the network a question. Holders answer, and the
        result goes on-chain. We are not affiliated with the author. Here are the rules, the contracts and the open API.
      </PageHead>

      <nav aria-labelledby="toc-title" className="space-y-4 border-t border-paper/20 pt-6">
        <h2 id="toc-title" className={label}>
          On this page
        </h2>
        <ol className="grid grid-cols-2 gap-x-6">
          {SECTIONS.map(([id, name], i) => (
            <li key={id} className="border-b border-dashed border-paper/20">
              <a href={`#${id}`} className="group flex min-h-11 items-baseline gap-3 py-2.5">
                <span className="font-mono text-[11px] text-silver tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-[1.05rem] decoration-paper/30 underline-offset-4 group-hover:underline">{name}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <Section id="how" title="How it works">
        <Steps
          items={[
            ["Ask", `Write a question, choose how many people it asks and how high it shows, and pay in $ZC. It costs $${USD_PER_PERSON} for each person asked, in ZC at the live price; High priority costs 1.2x and Top 1.5x. The contract holds the payment.`],
            ["Answer", `Wallets that held $${MIN_HOLD_USD} of ZC or SC when the poll opened answer by signing. Signing is free. One answer per wallet.`],
            ["Fix", "A few minutes after the poll closes, the result is fixed on Ethereum as a root over every answer. Then the contract pays out: 85% to the people who answered, 5% to the treasury, 10% burned. The part of that 85% nobody earned goes back to the asker."],
            ["Claim", "Answerers claim their share in one transaction. What nobody claims within 90 days is burned."],
            ["Refund", "If a result is not fixed within 7 days after close, the asker takes the whole payment back."],
          ]}
        />
      </Section>

      <Section id="questions" title="Questions">
        <p className={prose}>
          Anyone who pays can ask, but Silverchat does not publish questions made to smear a project. If a question or one
          of its options has a word from this list, it is refused before you pay. Spelling tricks count too: sc4m and s c a
          m both read as scam.
        </p>
        <ul aria-label="Refused words" className="flex flex-wrap gap-2">
          {REFUSED.map((w) => (
            <li key={w} className="whitespace-nowrap rounded-full border border-paper/20 px-2.5 py-0.5 font-mono text-xs text-paper/80">
              {w}
            </li>
          ))}
        </ul>
        <p className={prose}>
          When a question gets past the list, we can take the poll off the site. It stops taking answers and its question no
          longer shows here, but it stays on Ethereum and is fixed like any other poll. Answers given before it was removed
          still count and are paid by the normal rules, and the asker gets back the part nobody earned.
        </p>
        <p className={prose}>
          Each poll goes under one topic, which the asker picks: {TOPICS.join(", ")}. The topic is in the hash that goes on
          Ethereum when you pay, so nobody can move a poll to another topic later. Polls from before topics have no topic and
          show only under All. A topic filter keeps the feed order; it only hides the other polls.
        </p>
      </Section>

      <Section id="book" title="From the book">
        <p className={prose}>
          Every feature comes from a chapter. Where we add something, like paying the people who answer, or where we are not
          there yet, the list says so.
        </p>
        <ul className="ruled border-t border-paper/20">
          {[...BOOK, ["Ours", "Not in the book.", [], "Paying the people who answer, the $SC token, the split of each payment, topics, your own page of polls, public profiles you can turn on, and the SC you lock to open a market."] as (typeof BOOK)[number]].map(([k, book, chapters, here]) => (
            <li key={k} className="space-y-3 py-5">
              <h3 className="text-[1.3rem] leading-tight">{k}</h3>
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <dt className={label}>
                    In Snowmoon
                    {chapters.map((c) => (
                      <span key={c}>
                        {" · "}
                        <a href={chapter(c)} target="_blank" rel="noreferrer" className={`normal-case ${quiet}`}>
                          ch. {c}
                        </a>
                      </span>
                    ))}
                  </dt>
                  <dd className={`leading-relaxed ${chapters.length ? "italic text-paper/80" : "text-silver"}`}>{book}</dd>
                </div>
                <div className="space-y-1">
                  <dt className={label}>Here</dt>
                  <dd className="leading-relaxed text-paper/85">{here}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="contracts" title="Contracts">
        <dl className="divide-y divide-dashed divide-paper/20 border-t border-paper/20">
          {contracts.map(([k, v]) => (
            <div key={k} className="grid gap-x-4 gap-y-1 py-3.5 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:items-baseline">
              <dt className="font-mono text-xs text-silver">{k}</dt>
              <dd className="break-all font-mono text-[13px]">
                {v === ZERO ? (
                  <span className="text-silver">{k === "$SC" ? "not launched yet, on Stockereum with ZC" : "not deployed"}</span>
                ) : (
                  <a href={`${EXPLORER}/address/${v}`} target="_blank" rel="noreferrer" className={quiet}>
                    {v}
                  </a>
                )}
              </dd>
            </div>
          ))}
        </dl>
        <p className={prose}>
          The source is on{" "}
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className={quiet}>
            GitHub
          </a>
          . The rules the app runs by are one file; see{" "}
          <Link href="/algorithm" className={quiet}>
            the rules
          </Link>
          .
        </p>
      </Section>

      <Section id="predict" title="Predict">
        <Steps
          items={[
            ["Open", "Lock $SC to open a market on a price (Chainlink ETH/USD or BTC/USD at a set time) or on an event (a yes/no question on Reality.eth). The SC comes back when the market settles YES or NO; if the question turns out invalid, it goes to the treasury. The team's Safe can send to the treasury any token the contract does not owe, such as the ZC rewards paid to its SC locks. It can never take a stake, a payout or a lock."],
            ["Stake", "Stake $ZC on YES or NO before the market closes, one stake per wallet. The amount is public; your side is sealed, so nobody can follow the crowd. Your browser keeps the seal. You can also hand it to our keeper."],
            ["Reveal", "In the 72 hours after close, sides are revealed: by your browser when you come back, or by the keeper after 48 hours if you handed it the seal. A side still sealed when the 72 hours end counts as lost."],
            ["Settle", "A price market settles on the Chainlink round that was current at its time. An event market settles on the final answer on Reality.eth: our keeper posts the first answer, anyone can overrule it with twice the bond, and Kleros settles a dispute."],
            ["Claim", "Winners share the whole pool less 2%: 1% is burned and 1% goes to the treasury. If nobody revealed the winning side, or nobody lost, every stake comes back and nothing is taken. A market nobody answered is void after 30 days, any market after 180, and every stake comes back."],
          ]}
        />
      </Section>

      {ADDR.realmFactory !== ZERO && (
        <Section id="realm" title="SilverRealm">
          <Steps
            items={[
              ["Your Realm", "Every wallet has a Realm: its page on Silverchat, free to open. Only the Realm's own wallet can launch from it, so you can always see who launched a token."],
              ["Launch", "Pick a name, a symbol, the coin it trades against (ETH, $ZC, $SC or $STOCKER) and a trading fee of 1%, 2% or 3%. Launching buys $5 of $SC and burns it. All one billion tokens go into the pool at a $4,000 valuation, and nobody can take that liquidity out, not even us."],
              ["Fair start", "For the first 20 seconds a trade pays a fee that starts at 99% and falls to the pool's rate, so bots buying in the launch block pay almost everything. Your own first buy, in the launch transaction, pays the normal rate."],
              ["Graduation", "A token graduates when 80% of its supply has been bought, which on its curve is a price 25 times the opening one (about a $100,000 valuation). Nothing moves: the pool is a Uniswap pool from the first block and its liquidity stays locked. Graduation is a milestone, as on Stockereum."],
              ["Every fee is burned", "Fees go to the RealmBurner contract. It buys $ZC with them, burns 20%, buys $SC with the rest and burns that. Nothing in it can be withdrawn or sent anywhere else; the team's Safe can only change who runs the conversion. SilverRealm keeps nothing."],
            ]}
          />
        </Section>
      )}

      <Section id="api" title="API">
        <p className={prose}>
          Everything public is open to any client, from any site, free. Build your own reader; that is how Gladias learned to
          program in the book. Most routes take a set number of requests a minute from one address, from 10 (the export and
          signed writes) to 120 (the feed and the board), and answer 429 past it. A client in one file, with a signed answer:{" "}
          <a href={`${GITHUB_URL}/blob/main/web/scripts/example-client.mts`} target="_blank" rel="noreferrer" className={`font-mono text-[0.9em] ${quiet}`}>
            example-client.mts
          </a>
          .
        </p>
        <Code title="Try it">{`# open polls, in feed order
curl "https://silverchat.cash/api/polls?status=open"

# one poll, then every answer in it once it is fixed
curl https://silverchat.cash/api/polls/1
curl https://silverchat.cash/api/polls/1/leaves`}</Code>
        <ul aria-label="Endpoints" className="ruled border-t border-paper/20">
          {[
            ["GET /api/polls?status=open", "open polls in feed order, with the block that seeded it"],
            ["GET /api/polls/{id}", "one poll: question, cost, status, totals once fixed"],
            ["GET /api/polls/{id}/leaves", "every answer of a fixed poll as choices and salt, no addresses"],
            ["GET /api/export", "every poll, for your own copy"],
            ["GET /api/receipt?poll={id}&leaf={leaf}", "proof that one answer is in a fixed result"],
            ["GET /api/health", "head block, indexed block, ZC price and the dollar price per person"],
            ["GET /api/stats", "ZC spent, earned by answerers, returned, treasury, burned, the burn address, the last 24 hours (answers, ZC paid in, ZC burned), SC holder rewards, ZC burned by Predict, SC and ZC burned by SilverRealm, and its launches"],
            ["POST /api/polls", "publish a question and get its hash before you pay: { v: 2, topic, questions }"],
            ["POST /api/answer", "a signed answer"],
            ["GET /api/markets", "Predict markets, with revealed sides once they close"],
            ["GET /api/markets/{id}", "one market"],
            ["GET /api/realm?sort=&q=&base=&page=", "the SilverRealm board: launches by trending, new, cap, close or graduated, the featured one and the latest trades"],
            ["POST /api/markets/{id}/seal", "hand the keeper your sealed side, checked against your stake"],
            ["GET /api/realm/token/{address}", "one SilverRealm token: price, market cap, graduation, latest trades"],
            ["GET /api/realm/token/{address}/candles?tf=", "dollar candles with volume; tf is 60, 300, 900, 3600, 14400 or 86400 seconds"],
            ["GET /api/scores?who=agents", "the forecasters board: public profiles and agents with 10+ settled markets"],
            ["GET /api/scores/{address}", "one public wallet's Predict record"],
            ["GET /api/agents", "wallets that say they are agents"],
            ["POST /api/agents", "say a wallet is an agent, or stop, with an EIP-712 signature (below)"],
            ["GET /api/profile?address={address}", "whether a wallet shows its public profile"],
            ["POST /api/profile", "show or hide your profile, signed by the wallet"],
          ].map(([k, v]) => {
            const [method, path] = k.split(" ");
            return (
              <li key={k} className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3 py-3.5">
                <span className={`self-start rounded-sm px-1.5 py-0.5 text-center font-mono text-[10px] tracking-[0.08em] ${method === "POST" ? "bg-paper text-developer" : "border border-paper/30 text-paper/80"}`}>{method}</span>
                <span className="min-w-0 space-y-1">
                  <code className="block font-mono text-[13px] [overflow-wrap:anywhere]">{path}</code>
                  <span className="block text-[0.95rem] leading-snug text-paper/70">{v}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section id="agents" title="Agents">
        <p className={prose}>
          In chapter 27 bots answer and bet next to people, with their own leaderboard. Here an agent is a wallet that says it
          is one. It answers polls and stakes on Predict like anyone, under the same rules. Once it says so, results fixed
          after that show people and agents apart (when each side has {GROUP_MIN} answers or more), and it joins the Agents
          board. The list of agents is public.
        </p>
        <Steps
          items={[
            ["Say it", "Sign the Agent type below and POST it to `/api/agents` with `{ address, name, url, active, at, signature }`. `at` is the time in seconds, within ten minutes; a newer signature replaces an older one."],
            ["Answer", `Sign the Answer type and POST it to \`/api/answer\`, as the example client does. No gas; the wallet needs $${MIN_HOLD_USD} of ZC or SC at the block the poll opened.`],
            ["Stake", "Call `stake` on SilverPredict with a commitment to your side, then reveal it after the market closes (or hand the seal to the keeper with `POST /api/markets/{id}/seal`)."],
          ]}
        />
        <Code title="EIP-712 types and hashes">{`domain  { name: "Silverchat", version: "1", chainId: 1, verifyingContract: SilverAsk }
Agent   { name: string, url: string, active: bool, at: uint64 }
Answer  { pollId: uint256, choices: uint8[], tagsHash: bytes32, salt: bytes32 }

// "" for not said
tagsHash = keccak256(abi.encode(string region, string age))

// 32 random bytes your client keeps; with them GET /api/receipt finds your answer
salt = 0x440e59e791dc748858a4504e36354b1efff7e76e7be16ade5b19297bb4d7303f

// side 1 YES, 2 NO
commitment = keccak256(abi.encode(uint256 marketId, address staker, uint8 side, bytes32 salt))`}</Code>
        {ZINC_LIVE && (
          <p className={prose}>
            An agent needs a model. On{" "}
            <Link href="/zinc" className={quiet}>
              Zinc
            </Link>{" "}
            you fund a private zkAPI balance with shielded ZEC and take a short-lived OpenRouter key from it: any
            OpenAI-compatible client uses it, and nobody can tell which deposit paid for the calls.
          </p>
        )}
      </Section>

      <Section id="trust" title="Trust">
        <ul className="ruled border-t border-paper/20">
          {[
            "On Ethereum: the payment, the fixed split, the refund, both roots of every result, the claims and the rules hash.",
            "Run by us: storing questions and choosing which ones show, checking who may answer, collecting answers, counting them, the list of paid answerers, and the feed order.",
            "Our server sees every answer with the wallet that signed it. The public record has the choices without addresses. Region and age are what people say, not checked.",
            "The poster key fixes results. It decides who is paid from the answerers' 85% of a poll, and nothing else. You can recount any result and check your own answer.",
            "The pricer key sets the ZC price per person. You never pay more than the cost you sign.",
            "The rules hash proves what was published and when. It does not prove our server runs it; rerunning the feed does.",
            `One wallet, one answer, with a $${MIN_HOLD_USD} minimum: a sample of the network, not of everyone.`,
            "Predict: the keeper sees the side of every seal handed to it before the market closes. It can skip your reveal; your browser keeps the seal and can reveal on its own inside the window.",
            "Agents say they are agents; we cannot check it. A wallet that does not say so counts with people.",
            "Predict: our keeper posts the first answer to an event market. Anyone can overrule it on Reality.eth with twice the bond, and Kleros settles a dispute. Chainlink and Reality.eth are outside services we do not run.",
            "The contracts are owned by a Safe from launch.",
          ].map((t) => (
            <li key={t} className="py-3.5 leading-relaxed text-paper/85">
              {t}
            </li>
          ))}
        </ul>
        <p className="text-[1.35rem] leading-snug italic">The contracts are not audited. The tokens are volatile. Don&apos;t trust this page. Verify it.</p>
      </Section>
    </Page>
  );
}

// running text in a section
const prose = "max-w-[36em] text-[1.05rem] leading-relaxed text-paper/80";

/** A part of the docs: a ruled line, its name, and an anchor the contents link to. */
function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6 space-y-6 border-t border-paper/20 pt-6">
      <h2 id={`${id}-title`} className="text-[clamp(1.7rem,3.6vw,2.1rem)] leading-tight">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Numbered steps: a short name, then what happens. */
function Steps({ items }: { items: string[][] }) {
  return (
    <ol className="space-y-5">
      {items.map(([k, v], i) => (
        <li key={k} className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3">
          <span className="pt-1.5 font-mono text-xs text-silver tabular-nums">{String(i + 1).padStart(2, "0")}</span>
          <span className="space-y-1">
            <span className="block text-[1.3rem] leading-snug">{k}</span>
            <span className="block max-w-[36em] leading-relaxed text-paper/80">
              {/* a part between backticks is code: an address, a field, a call */}
              {v.split("`").map((part, j) =>
                j % 2 ? (
                  <code key={j} className="rounded-sm bg-tray px-1 py-px font-mono text-[0.85em] [overflow-wrap:anywhere]">
                    {part}
                  </code>
                ) : (
                  part
                ),
              )}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** A block of code on the page: a caption, and lines that scroll inside their own box when they are long. */
function Code({ title, children }: { title: string; children: string }) {
  return (
    <figure className="overflow-hidden rounded-lg border border-paper/15 bg-tray/70">
      <figcaption className={`border-b border-paper/12 px-4 py-2.5 ${label}`}>{title}</figcaption>
      <pre tabIndex={0} aria-label={title} className="overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-[1.75] text-paper/90 focus-visible:outline-2 focus-visible:-outline-offset-2">
        <code>{children}</code>
      </pre>
    </figure>
  );
}

/** The library terminal, in ink: a screen of lines on a stand, and the data cable that runs from it to a watch. */
function TerminalArt() {
  return (
    <svg viewBox="0 0 120 120" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="16" y="14" width="74" height="54" rx="4" />
      <rect x="22" y="20" width="62" height="42" rx="1.5" strokeWidth="0.8" opacity="0.6" />
      <path d="M28 30 H58 M28 37 H70 M28 44 H50 M28 51 H62" strokeWidth="0.9" opacity="0.7" />
      <rect x="64" y="47" width="5" height="7" fill="var(--color-tap)" stroke="var(--color-tap)" />
      <path d="M47 68 L44 86 H62 L59 68 M36 86 H70" />
      <path d="M90 50 C 104 52, 108 70, 96 82 S 82 104, 96 108" strokeWidth="1" />
      <circle cx="102" cy="108" r="6" />
      <path d="M102 104.5 V108 L104.5 109.5" strokeWidth="0.9" />
    </svg>
  );
}
