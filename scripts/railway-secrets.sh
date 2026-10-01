#!/usr/bin/env bash
# Puts the server's three hot keys and the private RPC URL on the Railway web service, read from ~/.config/silverchat.
# Each value goes from its file to Railway on stdin, so it never shows on screen or in the process list.
set -euo pipefail

cd "$(dirname "$0")/.."
dir="$HOME/.config/silverchat"
railway=$(command -v railway || echo "$HOME/.railway/bin/railway")

for pair in POSTER_PRIVATE_KEY:poster.key PRICER_PRIVATE_KEY:pricer.key KEEPER_PRIVATE_KEY:keeper.key RPC_URL:rpc; do
  file="$dir/${pair#*:}"
  [ -s "$file" ] || { echo "missing $file" >&2; exit 1; }
  tr -d '\n' < "$file" | "$railway" variable set "${pair%%:*}" --stdin --service web --skip-deploys >/dev/null
  echo "set ${pair%%:*}"
done
