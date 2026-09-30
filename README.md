# silverchat ($SC)

> "The more zipcoins you burn, the more people it polls." (*Snowmoon*, ch. 27)

The polling network from Vitalik Buterin's novel [Snowmoon](https://vitalik.eth.limo/snowmoon/html/), built on Ethereum. Not affiliated with the author.

- **Ask** — pay $ZC to put a question to the network. Breadth sets how many holders it reaches (10 to 10,000), priority how high it sits in the feed. The price is per person, in ZC at the live price.
- **Answer** — wallets holding $20 of ZC or SC at the block the poll opened answer with a signature. No gas, one answer per wallet, optional region and age.
- **Fix** — a few minutes after close the result is fixed on Ethereum as a root over every signed answer. Then the payment splits: up to 85% to the people who answered (an equal share per paid answer, the rest back to the asker), 5% to the treasury, 10% of the ZC is burned.
- **Claim** — answerers claim their share in one transaction within 90 days; what nobody claims is burned. If a result is not fixed within 7 days of close, the asker can take the whole payment back.
- **Pulse** — the open polls in feed order, ranked by one public rules file whose hash sits in `SilverAlgorithm` behind a 20-day delay (ch. 27).

Site: https://silverchat.cash · $ZC: `0x4E67DB19044549fF420860834c91b45BaD298722` · $SC: after launch, on Stockereum

## Verify it yourself

- Recount any result: `GET /api/polls/{id}/leaves` returns every answer of a fixed poll as choices and salt, no addresses. Your browser rebuilds the root and compares it with the one in `SilverAsk`'s `Finalized` log (`web/src/components/proof.tsx`).
- Check your own answer: the receipt kept in your browser proves your leaf is in that root.
- Rerun the feed: `web/scripts/verify-feed.mts` ranks the open polls with the published rules and the block that seeded them, and compares the order with `/api/polls?status=open`.
- The rules the app runs by are one file, `web/src/lib/algorithm.ts`. Its keccak256 is in `SilverAlgorithm`, and a new hash only counts twenty days after it is proposed.

## Layout

- `contracts/` — `SilverAsk` (payments, split, results, claims, refunds), `SilverAlgorithm` (rules hash, 20-day delay), mainnet-fork tests and the deploy script.
- `web/` — Next.js app and API; background loops for the indexer, the pricer and the finalizer (`src/instrumentation.ts`); Postgres.
- `scripts/` — local fork rehearsal, deploy, go-live.

## Run

```bash
cd web && pnpm install
anvil --fork-url <archive rpc> --chain-id 31337   # in another terminal
../scripts/local-up.sh                           # deploys to the fork, writes .env.local
pnpm dev
```

`pnpm exec tsc --noEmit && pnpm lint && pnpm build` before a push; `forge test` in `contracts/` (fork tests use `ETH_RPC_URL`, a public node by default); `pnpm dlx tsx scripts/e2e.mts` runs a poll end to end on the fork.

## Deploy

Keys live in `~/.config/silverchat/` (`deployer.key`, `poster.key`, `pricer.key`, `rpc`), never in the repo.

```bash
SAFE=0x... scripts/deploy-stack.sh           # simulate: gas, cost, roles
SAFE=0x... SEND=1 scripts/deploy-stack.sh    # deploy; the Safe owns everything from the first block
scripts/railway-secrets.sh                   # hot keys and RPC to the Railway service
scripts/go-live.sh                           # contract addresses to Railway, deploy main
```

## Trust and risks

On Ethereum: the payment, the split, the refund, both roots of every result, the claims and the rules hash. Run by us: storing questions and choosing which ones show, checking who may answer, collecting answers, counting them, choosing who is paid within a poll, and the feed order.

The poster key fixes results; it decides who is paid from the answerers' 85% of a poll and nothing else. The pricer key sets the ZC price per person, and you never pay more than the cost you sign. Our server sees every answer with the wallet that signed it; the public record has the choices without addresses. Region and age are what people say, not checked. One wallet, one answer, with a $20 minimum: a sample of the network, not of everyone.

The contracts are owned by a Safe and are not audited. $ZC and $SC are volatile; nothing here is investment advice.

MIT.
