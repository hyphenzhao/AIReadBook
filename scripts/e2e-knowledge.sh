#!/usr/bin/env bash
# Generates knowledge cards and a graph extraction for one chapter through the
# running app, and reports quality signals: how many card quotes were found in
# the text, how many nodes/relations came out, how many mentions are verified.
#   scripts/e2e-knowledge.sh <chapterId>     (run on the server)
set -euo pipefail
cd "$(dirname "$0")/.."
source "$HOME/.nvm/nvm.sh" >/dev/null
BASE=${BASE:-http://127.0.0.1:3000}
chapter=$1

token=$(node -e '
const fs=require("fs"),c=require("crypto");
const s=fs.readFileSync(".env.local","utf8").match(/^AUTH_SECRET=(.*)$/m)[1].trim();
const p="1."+(Math.floor(Date.now()/1000)+900);
process.stdout.write(p+"."+c.createHmac("sha256",s).update(p).digest("base64url"));')
cookie="Cookie: aireadbook_session=$token"
json="Content-Type: application/json"

echo "== cards"
start=$(date +%s.%N)
curl -s -m 170 -X POST -H "$cookie" -H "$json" -d "{\"chapterId\":$chapter}" "$BASE/api/cards/generate" >/tmp/e2e-cards.json
printf 'took %.1fs\n' "$(echo "$(date +%s.%N) - $start" | bc)"
node -e '
const j=JSON.parse(require("fs").readFileSync("/tmp/e2e-cards.json","utf8"));
if(j.error){ console.log("ERROR:", j.error); process.exit(0); }
const located=j.cards.filter(c=>c.source).length;
console.log(`created=${j.created} skipped=${j.skipped}  quotes located in text: ${located}/${j.cards.length}`);
const types={}; for(const c of j.cards) types[c.cardType]=(types[c.cardType]||0)+1; console.log("types:", JSON.stringify(types));
for(const c of j.cards.slice(0,4)) console.log(` - [${c.cardType}] ${c.title}: ${c.content.slice(0,70)}…\n     quote: ${c.quote? "「"+c.quote.slice(0,50)+"」":"(not found in text)"}`);'

echo; echo "== graph extraction"
job=$(curl -s -X POST -H "$cookie" -H "$json" -d "{\"chapterId\":$chapter}" "$BASE/api/graph/extract" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);console.log(j.job?j.job.id:"ERR "+j.error)})')
echo "job: $job"
case "$job" in ERR*) exit 0;; esac
for _ in $(seq 60); do
  state=$(curl -s -H "$cookie" "$BASE/api/jobs/$job" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d).job;console.log(j.status+"|"+(j.stage||"")+"|"+j.progress+"|"+(j.error||""))})')
  case "$state" in DONE*|FAILED*) break;; esac
  sleep 2
done
echo "final: $state"

curl -s -H "$cookie" "$BASE/api/graph" >/tmp/e2e-graph.json
node -e '
const g=JSON.parse(require("fs").readFileSync("/tmp/e2e-graph.json","utf8"));
const types={}; for(const n of g.nodes) types[n.type]=(types[n.type]||0)+1;
console.log(`graph now: ${g.nodes.length} nodes ${JSON.stringify(types)}, ${g.edges.length} edges, books: ${g.books.map(b=>b.title).join(", ")}`);
const name=new Map(g.nodes.map(n=>[n.id,n.name]));
for(const e of g.edges.slice(0,10)) console.log(`   ${name.get(e.srcId)} —${e.relation}→ ${name.get(e.dstId)}`);
const top=[...g.nodes].sort((a,b)=>b.mentions-a.mentions)[0];
if(top) console.log("TOP "+top.id);' | tee /tmp/e2e-graph.txt
top=$(grep -o 'TOP [0-9]*' /tmp/e2e-graph.txt | cut -d' ' -f2 || true)
if [ -n "$top" ]; then
  curl -s -H "$cookie" "$BASE/api/graph/nodes/$top" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const n=JSON.parse(d).node;const v=n.mentions.filter(m=>m.verified).length;console.log(`node "${n.name}" (${n.type}): ${n.description}\n  aliases: ${n.aliases.join(", ")||"-"}\n  mentions: ${n.mentions.length} (verified quote: ${v}), relations: ${n.relations.length}\n  e.g. 「${(n.mentions[0]?.quote||"").slice(0,60)}」 — ${n.mentions[0]?.chapterLabel}`)})'
fi
