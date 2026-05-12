#!/usr/bin/env bash
# Upload local data/bank/{raw,generic,done,fail,output}/* to Supabase Storage
# bucket "bank" (object key = "<prefix>/<filename>"). Idempotent: lists existing
# objects per prefix and skips them.
#
#   ./scripts/migrate-bank-to-supabase.sh
#
# Reads SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / BANK_BUCKET (default "bank")
# from .env at repo root. Uses curl -k for Windows cert-revocation issues.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
fi

: "${SUPABASE_URL:?SUPABASE_URL not set}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY not set}"
BUCKET="${BANK_BUCKET:-bank}"
BANK_DIR="${BANK_DIR:-$ROOT/data/bank}"

# .env may carry a WSL-style /mnt/c/... path; remap to a Git-Bash-friendly /c/...
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    if [[ "$BANK_DIR" == /mnt/* ]]; then
      BANK_DIR="/${BANK_DIR#/mnt/}"
    fi ;;
esac
[[ -d "$BANK_DIR" ]] || BANK_DIR="$ROOT/data/bank"

PREFIXES=(raw generic done fail output)
CONCURRENCY="${CONCURRENCY:-6}"

echo "bank dir : $BANK_DIR"
echo "bucket   : $BUCKET"
echo "endpoint : $SUPABASE_URL"
echo

content_type_for() {
  case "${1,,}" in
    *.png)  echo "image/png" ;;
    *.webp) echo "image/webp" ;;
    *.gif)  echo "image/gif" ;;
    *.jpg|*.jpeg) echo "image/jpeg" ;;
    *) echo "application/octet-stream" ;;
  esac
}

# List existing object names directly under a prefix (single page, up to 1000).
list_existing() {
  local prefix="$1" offset=0 page=1000
  while :; do
    local body resp
    body=$(printf '{"prefix":"%s","limit":%d,"offset":%d,"sortBy":{"column":"name","order":"asc"}}' \
      "$prefix" "$page" "$offset")
    resp=$(curl -sSk -X POST "${SUPABASE_URL}/storage/v1/object/list/${BUCKET}" \
      -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
      -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
      -H "Content-Type: application/json" \
      -d "$body")
    # Extract names
    local names
    names=$(echo "$resp" | grep -oE '"name":"[^"]+"' | sed 's/"name":"//;s/"$//' || true)
    if [[ -z "$names" ]]; then break; fi
    echo "$names"
    local count
    count=$(echo "$names" | wc -l | tr -d ' ')
    if (( count < page )); then break; fi
    offset=$(( offset + page ))
  done
}

# Upload one file. Echoes "OK", "SKIP" or "FAIL <code>".
upload_one() {
  local key="$1" abs="$2" ct="$3"
  local code
  # -o /dev/null: discard body; -w "%{http_code}": print status only
  code=$(curl -sSk -o /dev/null -w "%{http_code}" \
    -X POST "${SUPABASE_URL}/storage/v1/object/${BUCKET}/${key}" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: ${ct}" \
    -H "x-upsert: false" \
    --data-binary "@${abs}")
  case "$code" in
    200|201) echo "OK" ;;
    409) echo "SKIP" ;;
    *)   echo "FAIL $code" ;;
  esac
}

tot_q=0; tot_up=0; tot_skip=0; tot_fail=0

for prefix in "${PREFIXES[@]}"; do
  dir="$BANK_DIR/$prefix"
  if [[ ! -d "$dir" ]]; then
    echo "[$prefix] (dir missing, skip)"
    continue
  fi
  shopt -s nullglob
  files=("$dir"/*)
  shopt -u nullglob
  if (( ${#files[@]} == 0 )); then
    echo "[$prefix] empty"
    continue
  fi

  # Build a lookup file of existing remote names for O(1) checks
  remote_file=$(mktemp)
  list_existing "$prefix" > "$remote_file" || true
  remote_count=$(wc -l < "$remote_file" | tr -d ' ')
  echo "[$prefix] ${#files[@]} local, ${remote_count} already in bucket"

  up=0; skip=0; fail=0
  # Run uploads in parallel batches
  pids=()
  results=()
  i=0
  for f in "${files[@]}"; do
    name=$(basename "$f")
    tot_q=$((tot_q+1))
    if grep -Fxq -- "$name" "$remote_file" 2>/dev/null; then
      skip=$((skip+1)); tot_skip=$((tot_skip+1))
      continue
    fi
    [[ -f "$f" ]] || continue
    ct=$(content_type_for "$name")
    key="${prefix}/${name}"
    # serial upload to keep it simple & reliable on Windows curl
    res=$(upload_one "$key" "$f" "$ct")
    case "$res" in
      OK)   up=$((up+1));   tot_up=$((tot_up+1));   echo "  + $key" ;;
      SKIP) skip=$((skip+1)); tot_skip=$((tot_skip+1)) ;;
      FAIL*)
        fail=$((fail+1)); tot_fail=$((tot_fail+1))
        echo "  fail $key: $res" ;;
    esac
    if (( tot_up > 0 && tot_up % 25 == 0 )); then
      echo "  ... $tot_up uploaded so far"
    fi
  done
  rm -f "$remote_file"
  echo "  -> uploaded=$up skipped=$skip failed=$fail"
done

echo
echo "== migration complete =="
echo "queued    : $tot_q"
echo "uploaded  : $tot_up"
echo "skipped   : $tot_skip"
echo "failed    : $tot_fail"

[[ $tot_fail -eq 0 ]] || exit 2
