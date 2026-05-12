#!/usr/bin/env bash
# Pousse les variables d'env de .env vers les services Railway.
# Usage: bash scripts/railway-push-env.sh [web|worker]
set -euo pipefail

SVC="${1:?usage: $0 <web|worker>}"
ENV_FILE="${ENV_FILE:-.env}"

# Variables communes (web + worker)
COMMON_KEYS=(
  DATABASE_URL
  AUTH_SECRET
  ANTHROPIC_API_KEY
  CLAUDE_MODEL
  TAVILY_API_KEY
  PUBLISH_PROVIDER
  PUBLER_API_KEY
  PUBLER_WORKSPACE_ID
  PUBLER_INSTAGRAM_ACCOUNT_ID
  AYRSHARE_API_KEY
  IG_ACCESS_TOKEN
  IG_USER_ID
  META_APP_ID
  META_APP_SECRET
  INSTAGRAM_USERNAME
  PINTEREST_WORKER_URL
  PINTEREST_WORKER_TOKEN
  PINTEREST_COOKIES
  UNSPLASH_KEY
  INSPIRATION_ACCOUNTS
  SEED_ADMIN_EMAIL
  SEED_ADMIN_PASSWORD
  SEED_ADMIN_NAME
)

WEB_KEYS=(
  AUTH_URL
  AUTH_TRUST_HOST
)

WORKER_KEYS=(
  CRON_SCRAPE_SCHEDULE
  CRON_PUBLISH_SCHEDULE
  CRON_PINTEREST_SCHEDULE
  CRON_BANKREVIEW_PUSH_SCHEDULE
  WHISPER_MODEL
)

case "$SVC" in
  web)    KEYS=("${COMMON_KEYS[@]}" "${WEB_KEYS[@]}") ;;
  worker) KEYS=("${COMMON_KEYS[@]}" "${WORKER_KEYS[@]}") ;;
  *) echo "service must be web or worker"; exit 1 ;;
esac

# Charge .env (sans exporter ailleurs)
declare -A ENV_VALS
while IFS='=' read -r k v; do
  [[ -z "$k" || "$k" =~ ^# ]] && continue
  [[ ! "$k" =~ ^[A-Z_][A-Z0-9_]*$ ]] && continue
  # strip surrounding quotes
  v="${v%\"}"; v="${v#\"}"
  v="${v%\'}"; v="${v#\'}"
  ENV_VALS["$k"]="$v"
done < "$ENV_FILE"

# Construit la liste --set
ARGS=()
for k in "${KEYS[@]}"; do
  if [[ -n "${ENV_VALS[$k]:-}" ]]; then
    ARGS+=(--set "$k=${ENV_VALS[$k]}")
  fi
done

# Surcharges : références internes Railway + chemins prod
ARGS+=(--set "REDIS_URL=\${{Redis.REDIS_URL}}")
ARGS+=(--set "BANK_DIR=/data/bank")
ARGS+=(--set "NODE_ENV=production")

if [[ "$SVC" == "worker" ]]; then
  ARGS+=(--set "RAILWAY_DOCKERFILE_PATH=Dockerfile.worker")
fi

if [[ "$SVC" == "web" ]]; then
  ARGS+=(--set "RAILWAY_DOCKERFILE_PATH=Dockerfile")
fi

echo "Pushing ${#ARGS[@]} args to service '$SVC'..."
railway variables -s "$SVC" --skip-deploys "${ARGS[@]}"
