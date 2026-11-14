#!/usr/bin/env bash
# Copies the secret variables from .env.local to the linked Vercel project (production target).
# Run it yourself: the values go from the file straight to Vercel and are never printed.
#   bash scripts/vercel-push-secrets.sh
# Afterwards redeploy:  npx vercel deploy --prod --yes
set -euo pipefail
cd "$(dirname "$0")/.."

SECRETS=(
  SUPABASE_SERVICE_ROLE_KEY
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  TELEGRAM_BOT_ID
  TELEGRAM_BOT_TOKEN
  TELEGRAM_CLIENT_SECRET
  BRIDGE_KEK
  BRIDGE_ED25519_PRIVATE_KEY
  TOMBSTONE_HMAC_KEY
)

for name in "${SECRETS[@]}"; do
  value="$(grep -E "^${name}=" .env.local | head -1 | cut -d= -f2-)"
  if [ -z "$value" ]; then
    echo "skip ${name}: not found in .env.local"
    continue
  fi
  printf '%s' "$value" | npx --yes vercel@latest env add "$name" production --force --sensitive >/dev/null
  echo "set ${name}"
done
echo "Done. Redeploy now: npx vercel deploy --prod --yes"
