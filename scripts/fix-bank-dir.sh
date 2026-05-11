#!/bin/bash
set -e
cd /mnt/c/Users/20016390/Desktop/rush/rush-v2
ABS="$(pwd)/data/bank"
echo "ABS=$ABS"
for f in .env apps/web/.env apps/worker/.env; do
  sed -i "s|^BANK_DIR=.*|BANK_DIR=${ABS}|" "$f"
  grep BANK_DIR "$f"
done
mkdir -p data/bank/raw data/bank/generic data/bank/done data/bank/fail
if compgen -G "apps/web/data/bank/raw/*" > /dev/null; then
  mv apps/web/data/bank/raw/* data/bank/raw/
fi
ls data/bank/raw
