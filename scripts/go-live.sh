#!/usr/bin/env bash
# Points the live site at the deployed contracts: sets their addresses on the Railway web service, then deploys exactly
# what is committed on main. Asking opens once it is up and the pricer has set the first price.
set -euo pipefail

cd "$(dirname "$0")/.."
out="contracts/deployments/${OUT:-mainnet}.json"
railway=$(command -v railway || echo "$HOME/.railway/bin/railway")
get() { python3 -c "import json,sys; print(json.load(open('$out'))[sys.argv[1]])" "$1"; }
project=$("$railway" status --json | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")

"$railway" variable set --service web --skip-deploys \
  "NEXT_PUBLIC_ASK=$(get ask)" "NEXT_PUBLIC_ALGORITHM=$(get algorithm)" "NEXT_PUBLIC_BUYBACK=$(get buyback)" \
  "NEXT_PUBLIC_DEPLOY_BLOCK=$(get deployBlock)" "NEXT_PUBLIC_COMMIT=$(git rev-parse main)"

tmp=$(mktemp -d)
git archive main web | tar -x -C "$tmp"
(cd "$tmp/web" && "$railway" up -p "$project" -e production -s web -d -m "main $(git rev-parse --short main)")
echo "deploying main $(git rev-parse --short main); watch it with: $railway logs --service web"
