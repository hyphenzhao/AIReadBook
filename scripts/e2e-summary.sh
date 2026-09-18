#!/usr/bin/env bash
# Generates a chapter summary through the running app, then checks that the
# second read is served from cache and that every citation it contains points
# at a real passage.   scripts/e2e-summary.sh <chapterId>   (run on the server)
set -euo pipefail
cd "$(dirname "$0")/.."
source "$HOME/.nvm/nvm.sh" >/dev/null
BASE=${BASE:-http://127.0.0.1:3000}
chapter=$1

token=$(node -e '
const fs=require("fs"),c=require("crypto");
const s=fs.readFileSync(".env.local","utf8").match(/^AUTH_SECRET=(.*)$/m)[1].trim();
const p="1."+(Math.floor(Date.now()/1000)+600);
process.stdout.write(p+"."+c.createHmac("sha256",s).update(p).digest("base64url"));')
cookie="Cookie: aireadbook_session=$token"

start=$(date +%s.%N)
curl -s -m 170 -N -X POST -H "$cookie" -H "Content-Type: application/json" \
  -d "{\"prompt\":\"\",\"chapterId\":\"$chapter\"}" "$BASE/api/summary" >/tmp/e2e-summary.txt
printf 'generate: %s text parts in %.1fs, %s\n' "$(grep -c '^0:' /tmp/e2e-summary.txt)" \
  "$(echo "$(date +%s.%N) - $start" | bc)" "$(grep '^d:' /tmp/e2e-summary.txt | grep -o '"finishReason":"[a-z]*"' || echo 'no finish line')"
grep '^3:' /tmp/e2e-summary.txt | cut -c1-200 || true

sleep 1
start=$(date +%s.%N)
curl -s -H "$cookie" "$BASE/api/summary?chapterId=$chapter" >/tmp/e2e-summary.json
printf 'cached read: %.2fs\n' "$(echo "$(date +%s.%N) - $start" | bc)"
node -e '
const j=JSON.parse(require("fs").readFileSync("/tmp/e2e-summary.json","utf8"));
if(!j.summary){ console.log("NOT CACHED:", JSON.stringify(j).slice(0,200)); process.exit(1); }
const ids=new Set(j.sources.map(s=>s.id));
const cited=[...j.summary.matchAll(/\[(c\d+)\]/g)].map(m=>m[1]);
console.log(`cached ${j.summary.length} chars, model=${j.model}, sources=${j.sources.length}, citations=${cited.length}, invented=${cited.filter(i=>!ids.has(i)).length}`);
console.log(j.summary.slice(0,500));'
