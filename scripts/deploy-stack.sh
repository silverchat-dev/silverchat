#!/usr/bin/env bash
# Deploys SilverAlgorithm and SilverAsk to Ethereum from the deployer key in ~/.config/silverchat, with
# the Safe as owner and treasury from the first block (the deployer keeps no role). It simulates first, prices gas from
# the last blocks, refuses to spend more than MAX_ETH, then sends one transaction at a time and checks every address.
#
#   SAFE=0x... scripts/deploy-stack.sh           simulate, show the gas and what it would cost
#   SAFE=0x... SEND=1 scripts/deploy-stack.sh    deploy
set -euo pipefail

cd "$(dirname "$0")/../contracts"
dir="$HOME/.config/silverchat"
rpc=$(<"$dir/rpc")
max_eth=${MAX_ETH:-0.01}
addr() { cast wallet address --private-key "$(<"$dir/$1.key")"; }
# the RPC URL carries an API key: keep it out of anything printed
mask() { sed "s#${rpc}#<rpc>#g"; }
exec 2> >(mask >&2)

export OWNER=${SAFE:?set SAFE to the treasury Safe} TREASURY=$SAFE OUT=${OUT:-mainnet}
POSTER=$(addr poster) PRICER=$(addr pricer) DEPLOYER=$(addr deployer)
export POSTER PRICER
[ "$(cast chain-id --rpc-url "$rpc")" = 1 ] || { echo "the RPC is not mainnet" >&2; exit 1; }
[ "$(cast code "$SAFE" --rpc-url "$rpc")" != 0x ] || { echo "no contract at $SAFE" >&2; exit 1; }
[ -z "$(git status --porcelain ../web/src/lib/algorithm.ts)" ] || { echo "commit the rules file first" >&2; exit 1; }
git fetch -q origin main && git merge-base --is-ancestor HEAD origin/main || { echo "deploy from a commit that is on main, so the rules link works" >&2; exit 1; }

# the rules the app runs by: the file's hash, and where to read that exact version
export RULES_HASH=$(cast keccak "0x$(xxd -p ../web/src/lib/algorithm.ts | tr -d '\n')")
export RULES_SOURCE="https://github.com/silverchat-dev/silverchat/blob/$(git rev-parse HEAD)/web/src/lib/algorithm.ts"

# gas: the base fee now plus a tip recent blocks accepted (the median of their 25th percentile, at least 0.01 gwei);
# the max fee leaves room for the base fee to double before a transaction would wait. Only base + tip is paid.
base=$(cast base-fee --rpc-url "$rpc")
tip=$(cast rpc eth_feeHistory 20 latest '[25]' --rpc-url "$rpc" |
  python3 -c 'import json,sys; r=sorted(int(x[0],16) for x in json.load(sys.stdin)["reward"]); print(max(r[len(r)//2], 10**7))')
cap=$((base * 2 + tip))
flags=(--rpc-url "$rpc" --private-key "$(<"$dir/deployer.key")" --with-gas-price "$cap" --priority-gas-price "$tip")

sim=$(forge script Silverchat.s.sol:Deploy "${flags[@]}" 2>&1 | mask) || { tail -20 <<<"$sim" >&2; exit 1; }
gas=$(sed -n 's/.*Estimated total gas used for script: \([0-9]*\).*/\1/p' <<<"$sim")
echo "$sim" | grep -E "^\s+(zc|owner|treasury|poster|pricer) " || true
python3 - "$gas" "$base" "$tip" "$cap" "$max_eth" "$(cast balance "$DEPLOYER" --rpc-url "$rpc")" <<'EOF'
import sys
gas, base, tip, cap, limit, bal = (int(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), float(sys.argv[5]), int(sys.argv[6]))
g = lambda w: f"{w / 1e9:.3f} gwei"
e = lambda w: f"{w / 1e18:.6f} ETH"
print(f"gas {gas:,}  base {g(base)}  tip {g(tip)}  max fee {g(cap)}")
print(f"cost now {e(gas * (base + tip))}  at most {e(gas * cap)}  deployer has {e(bal)}")
if gas * cap > limit * 1e18: sys.exit(f"at most {e(gas * cap)} is over MAX_ETH={limit}; wait for cheaper blocks")
if gas * cap > bal: sys.exit("the deployer can't cover the worst case")
EOF
# the script writes its JSON even when only simulating: those addresses have no code yet
[ "${SEND:-}" = 1 ] || { rm -f "deployments/$OUT.json"; echo "simulated only; SEND=1 to deploy"; exit 0; }

# the JSON is written while simulating, so a broadcast that fails partway must not leave predicted addresses behind
forge script Silverchat.s.sol:Deploy "${flags[@]}" --broadcast --slow 2>&1 | mask || { rm -f "deployments/$OUT.json"; exit 1; }
out="deployments/$OUT.json"
for k in ask algorithm; do
  a=$(python3 -c "import json; print(json.load(open('$out'))['$k'])")
  [ "$(cast code "$a" --rpc-url "$rpc")" != 0x ] || { echo "no code at $k $a" >&2; exit 1; }
  echo "$k $a"
done
python3 - broadcast/Silverchat.s.sol/1/run-latest.json <<'EOF'
import json, sys
r = json.load(open(sys.argv[1]))["receipts"]
paid = sum(int(x["gasUsed"], 16) * int(x["effectiveGasPrice"], 16) for x in r)
print(f"{len(r)} transactions, paid {paid / 1e18:.6f} ETH")
EOF
