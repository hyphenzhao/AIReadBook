#!/usr/bin/env bash
# Asks the running app real questions and prints, for each, the retrieval tier
# the pipeline reached, what it cited, and the start of the answer.
#   scripts/e2e-chat.sh <bookId> <chapterIndex> "question" ["question" ...]
# Run on the server. Mints a 10-minute session for user 1 from AUTH_SECRET.
set -euo pipefail
cd "$(dirname "$0")/.."
source "$HOME/.nvm/nvm.sh" >/dev/null
BASE=${BASE:-http://127.0.0.1:3000}
MODE=${MODE:-companion}
WEB=${WEB:-auto}
book=$1; chapter=$2; shift 2

token=$(node -e '
const fs=require("fs"),c=require("crypto");
const s=fs.readFileSync(".env.local","utf8").match(/^AUTH_SECRET=(.*)$/m)[1].trim();
const p="1."+(Math.floor(Date.now()/1000)+600);
process.stdout.write(p+"."+c.createHmac("sha256",s).update(p).digest("base64url"));')

for question in "$@"; do
  body=$(node -e 'console.log(JSON.stringify({bookId:process.argv[1],chapterIndex:Number(process.argv[2]),mode:process.argv[3],web:process.argv[4],messages:[{role:"user",content:process.argv[5]}]}))' "$book" "$chapter" "$MODE" "$WEB" "$question")
  printf '\n\033[1mQ: %s\033[0m\n' "$question"
  curl -s -m 90 -N -X POST -H "Cookie: aireadbook_session=$token" -H "Content-Type: application/json" -d "$body" "$BASE/api/chat" | node -e '
let raw="";process.stdin.on("data",c=>raw+=c).on("end",()=>{
  let text="",src=null,err=null;
  for(const line of raw.split("\n")){
    const i=line.indexOf(":"); if(i<0) continue;
    const kind=line.slice(0,i); let val; try{val=JSON.parse(line.slice(i+1))}catch{continue}
    if(kind==="0") text+=val;
    if(kind==="8") src=val.find(a=>a.type==="sources")||src;
    if(kind==="3") err=val;
  }
  if(!src && !text){ console.log("  RAW:",raw.slice(0,300)); return; }
  if(src){
    const p=src.sources.filter(s=>s.kind==="passage"), w=src.sources.filter(s=>s.kind==="web");
    const chapters=[...new Set(p.map(s=>s.chapterTitle))];
    console.log(`  tier=${src.tier}  passages=${p.length}  web=${w.length} (searched=${src.webSearched})  chapters: ${chapters.slice(0,4).join(" | ")}`);
    const ids=new Set(src.sources.map(s=>s.id));
    const cited=[...text.matchAll(/\[([cw]\d+)\]/g)].map(m=>m[1]);
    const bogus=cited.filter(id=>!ids.has(id));
    console.log(`  citations in answer: ${cited.length}  (not in sources: ${bogus.length}${bogus.length?" -> "+bogus.join(","):""})`);
  }
  if(err) console.log("  ERROR:",err);
  console.log("  A:",text.replace(/\s+/g," ").slice(0,260));
});'
done
