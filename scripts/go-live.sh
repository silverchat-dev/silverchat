#!/usr/bin/env bash
# Points the live site at the deployed contracts: sets their addresses on the Railway web service, then deploys exactly
# what is committed on main. Asking opens once it is up and the pricer has set the first price.
set -euo pipefail

cd "$(dirname "$0")/.."
out="contracts/deployments/${OUT:-mainnet}.json"
railway=$(command -v railway || echo "$HOME/.railway/bin/railway")
get() { python3 -c "import json,sys; print(json.load(open('$out'))[sys.argv[1]])" "$1"; }
rpc=$(<"$HOME/.config/silverchat/rpc")
for k in ask algorithm; do
  [ "$(cast code "$(get $k)" --rpc-url "$rpc" 2>/dev/null)" != 0x ] || { echo "no contract at $k $(get $k); deploy first" >&2; exit 1; }
done
project=$("$railway" status --json | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
# deploy what is on GitHub, the same commit the rules link and hash point at
git fetch -q origin main
commit=$(git rev-parse origin/main)

"$railway" variable set --service web --skip-deploys \
  "NEXT_PUBLIC_ASK=$(get ask)" "NEXT_PUBLIC_ALGORITHM=$(get algorithm)" \
  "NEXT_PUBLIC_DEPLOY_BLOCK=$(get deployBlock)" "NEXT_PUBLIC_COMMIT=$commit"

tmp=$(mktemp -d)
git archive "$commit" web | tar -x -C "$tmp"
(cd "$tmp/web" && "$railway" up -p "$project" -e production -s web -d -m "main ${commit:0:7}")
echo "deploying main ${commit:0:7}; watch it with: $railway logs --service web"
