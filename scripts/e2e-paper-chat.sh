#!/usr/bin/env bash
# Asks the running app real questions about a paper and reports, for each: the
# retrieval tier reached, which pages the evidence came from, whether every
# passage carries highlight boxes, and whether any cited marker was invented.
#   scripts/e2e-paper-chat.sh <paperId> <pageInView> "question" ["question" ...]
set -euo pipefail
cd "$(dirname "$0")/.."
source "$HOME/.nvm/nvm.sh" >/dev/null
BASE=${BASE:-http://127.0.0.1:3000}
WEB=${WEB:-auto}
paper=$1; page=$2; shift 2

token=$(node -e '
const fs=require("fs"),c=require("crypto");
const s=fs.readFileSync(".env.local","utf8").match(/^AUTH_SECRET=(.*)$/m)[1].trim();
const p="1."+(Math.floor(Date.now()/1000)+600);
process.stdout.write(p+"."+c.createHmac("sha256",s).update(p).digest("base64url"));')

for question in "$@"; do
  body=$(node -e 'console.log(JSON.stringify({paperId:Number(process.argv[1]),page:Number(process.argv[2]),mode:"companion",web:process.argv[3],messages:[{role:"user",content:process.argv[4]}]}))' "$paper" "$page" "$WEB" "$question")
  printf '\n\033[1mQ: %s\033[0m\n' "$question"
  curl -s -m 120 -N -X POST -H "Cookie: aireadbook_session=$token" -H "Content-Type: application/json" -d "$body" "$BASE/api/chat" | node -e '
let raw="";process.stdin.on("data",c=>raw+=c).on("end",()=>{
  let text="",src=null,err=null,finish="";
  for(const line of raw.split("\n")){
    const i=line.indexOf(":"); if(i<0) continue;
    const kind=line.slice(0,i); let val; try{val=JSON.parse(line.slice(i+1))}catch{continue}
    if(kind==="0") text+=val;
    if(kind==="8") src=val.find(a=>a.type==="sources")||src;
    if(kind==="3") err=val;
    if(kind==="d") finish=val.finishReason;
  }
  if(!src && !text){ console.log("  RAW:",raw.slice(0,300)); return; }
  if(src){
    const p=src.sources.filter(s=>s.kind==="passage");
    const boxed=p.filter(s=>s.pageBoxes&&s.pageBoxes.length&&s.pageBoxes[0].boxes.length).length;
    const pages=[...new Set(p.map(s=>s.page))].sort((a,b)=>a-b);
    const papers=[...new Set(p.map(s=>s.paperId))];
    console.log(`  tier=${src.tier}  passages=${p.length} (with highlight boxes: ${boxed})  pages: ${pages.join(",")}  papers: ${papers.length}  web=${src.sources.length-p.length}`);
    const sections=[...new Set(p.map(s=>s.chapterTitle).filter(Boolean))];
    console.log(`  sections: ${sections.join(" | ")||"-"}`);
    const ids=new Set(src.sources.map(s=>s.id));
    const cited=[...text.matchAll(/\[([cw]\d+)\]/g)].map(m=>m[1]);
    console.log(`  citations in answer: ${cited.length} (invented: ${cited.filter(id=>!ids.has(id)).length})  finish=${finish}`);
  }
  if(err) console.log("  ERROR:",err);
  console.log("  A:",text.replace(/\s+/g," ").slice(0,300));
});'
done
