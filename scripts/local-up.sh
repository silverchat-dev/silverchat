#!/usr/bin/env bash
# Local rehearsal: deploy Silverchat on an anvil mainnet fork, give a test wallet some ZC and point web/.env.local at it.
# Prereq (separate terminal): anvil --fork-url <archive rpc> --chain-id 31337 --port 8545
# The fork RPC must serve historical state (drpc, flashbots, tenderly do; publicnode does not).
#   WALLET=0x...  optional, the address to fund with ZC (default: anvil account 5)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RPC=http://127.0.0.1:8545
ZC=0x4E67DB19044549fF420860834c91b45BaD298722
POOL_MANAGER=0x000000000004444c5dc75cB358380D2e3dE08A90

# anvil default test accounts; these keys are public test keys. The deployer holds no role, as on mainnet.
DEPLOYER_PK=0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6
OWNER_PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
POSTER_PK=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
PRICER_PK=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
KEEPER_PK=0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6
addr() { cast wallet address --private-key "$1"; }
WALLET=${WALLET:-0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc}

RULES="$ROOT/web/src/lib/algorithm.ts"
RULES_HASH=$( [ -f "$RULES" ] && cast keccak "0x$(xxd -p "$RULES" | tr -d '\n')" || cast keccak "" )

cd "$ROOT/contracts"
mkdir -p deployments
OUT=local OWNER=$(addr $OWNER_PK) TREASURY=0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65 POSTER=$(addr $POSTER_PK) \
  PRICER=$(addr $PRICER_PK) KEEPER=$(addr $KEEPER_PK) RULES_HASH=$RULES_HASH RULES_SOURCE=web/src/lib/algorithm.ts \
  forge script Silverchat.s.sol:Deploy --rpc-url $RPC --broadcast --private-key "$DEPLOYER_PK" --slow >/dev/null

# ZC for the test wallet, straight out of the v4 PoolManager
cast rpc anvil_impersonateAccount $POOL_MANAGER --rpc-url $RPC >/dev/null
cast rpc anvil_setBalance $POOL_MANAGER 0x56BC75E2D63100000 --rpc-url $RPC >/dev/null
cast send $ZC "transfer(address,uint256)" "$WALLET" 5000000000000000000000000 --from $POOL_MANAGER --unlocked --rpc-url $RPC >/dev/null
cast rpc anvil_stopImpersonatingAccount $POOL_MANAGER --rpc-url $RPC >/dev/null

python3 - "$ROOT/contracts/deployments/local.json" "$ROOT/web/.env.local" "$POSTER_PK" "$PRICER_PK" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
open(sys.argv[2], "w").write(f"""# local anvil fork of mainnet (anvil default test keys only)
NEXT_PUBLIC_CHAIN_ID=31337
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545
NEXT_PUBLIC_ASK={d['ask']}
NEXT_PUBLIC_ALGORITHM={d['algorithm']}
NEXT_PUBLIC_BUYBACK={d['buyback']}
NEXT_PUBLIC_DEPLOY_BLOCK={d['deployBlock']}
RPC_URL=http://127.0.0.1:8545
POSTER_PRIVATE_KEY={sys.argv[3]}
PRICER_PRIVATE_KEY={sys.argv[4]}
PRICE_USD_PER_PERSON=0.10
ENABLE_WORKERS=1
""")
print(json.dumps(d, indent=2))
PY
echo "funded $WALLET with 5,000,000 ZC"
