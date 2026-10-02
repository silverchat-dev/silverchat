#!/usr/bin/env bash
# Points the live site at the deployed contracts: sets their addresses on the Railway web service, then deploys exactly
# what is committed on main. Asking opens once it is up and the pricer has set the first price.
set -euo pipefail

cd "$(dirname "$0")/.."
out="contracts/deployments/${OUT:-mainnet}.json"
railway=$(command -v railway || echo "$HOME/.railway/bin/railway")
get() { python3 -c "import json,sys; print(json.load(open('$out'))[sys.argv[1]])" "$1"; }
rpc=$(<"$HOME/.config/silverchat/rpc")
# a failed read must stop the deploy too, not pass as "there is code"
has_code() { local code; code=$(cast code "$1" --rpc-url "$rpc") && [ -n "$code" ] && [ "$code" != 0x ]; }
for k in ask algorithm; do
  has_code "$(get $k)" || { echo "no contract at $k $(get $k), or the RPC failed; deploy first" >&2; exit 1; }
done
project=$("$railway" status --json | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
# deploy what is on GitHub, the same commit the rules link and hash point at
git fetch -q origin main
commit=$(git rev-parse origin/main)

# SilverRiddle only once it is deployed; until then /riddle is a 404 and nothing links to it
riddle=()
if python3 -c "import json,sys; sys.exit('riddle' not in json.load(open('$out')))"; then
  has_code "$(get riddle)" || { echo "no contract at riddle $(get riddle), or the RPC failed" >&2; exit 1; }
  riddle=("NEXT_PUBLIC_RIDDLE=$(get riddle)")
fi
# SilverPredict only once it is deployed; until then the Predict tab and its keeper stay off
predict=()
if python3 -c "import json,sys; sys.exit('predict' not in json.load(open('$out')))"; then
  has_code "$(get predict)" || { echo "no contract at predict $(get predict), or the RPC failed" >&2; exit 1; }
  predict=("NEXT_PUBLIC_PREDICT=$(get predict)" "NEXT_PUBLIC_PREDICT_BLOCK=$(get predictBlock)")
fi
# SilverRealm only once it is deployed; until then the Realm pages and its keeper stay off
realm=()
if python3 -c "import json,sys; sys.exit('realmFactory' not in json.load(open('$out')))"; then
  has_code "$(get realmFactory)" || { echo "no contract at realmFactory $(get realmFactory), or the RPC failed" >&2; exit 1; }
  realm=("NEXT_PUBLIC_REALM_FACTORY=$(get realmFactory)" "NEXT_PUBLIC_REALM_HOOK=$(get realmHook)" "NEXT_PUBLIC_REALM_BURNER=$(get realmBurner)" "NEXT_PUBLIC_REALM_BLOCK=$(get realmBlock)")
fi

"$railway" variable set --service web --skip-deploys \
  "NEXT_PUBLIC_ASK=$(get ask)" "NEXT_PUBLIC_ALGORITHM=$(get algorithm)" \
  "NEXT_PUBLIC_DEPLOY_BLOCK=$(get deployBlock)" "NEXT_PUBLIC_COMMIT=$commit" ${riddle[@]+"${riddle[@]}"} ${predict[@]+"${predict[@]}"} ${realm[@]+"${realm[@]}"}

tmp=$(mktemp -d)
git archive "$commit" web | tar -x -C "$tmp"
(cd "$tmp/web" && "$railway" up -p "$project" -e production -s web -d -m "main ${commit:0:7}")
echo "deploying main ${commit:0:7}; watch it with: $railway logs --service web"
