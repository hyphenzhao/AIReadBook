#!/usr/bin/env bash
# Uploads a PDF through the running app and follows it through the pipeline:
# upload -> Range serving -> extraction -> metadata -> chunks -> embeddings.
#   scripts/e2e-paper.sh <file.pdf> [--keep]      (run on the server)
# Without --keep the test paper is deleted again at the end.
set -euo pipefail
cd "$(dirname "$0")/.."
source "$HOME/.nvm/nvm.sh" >/dev/null
BASE=${BASE:-http://127.0.0.1:3000}
file=$1
keep=${2:-}

token=$(node -e '
const fs=require("fs"),c=require("crypto");
const s=fs.readFileSync(".env.local","utf8").match(/^AUTH_SECRET=(.*)$/m)[1].trim();
const p="1."+(Math.floor(Date.now()/1000)+900);
process.stdout.write(p+"."+c.createHmac("sha256",s).update(p).digest("base64url"));')
cookie="Cookie: aireadbook_session=$token"
name=$(node -e 'console.log(encodeURIComponent(require("path").basename(process.argv[1])))' "$file")
json() { node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);console.log(eval(process.argv[1]))})' "$1"; }

echo "== upload ($(du -h "$file" | cut -f1))"
start=$(date +%s.%N)
curl -s -X POST -H "$cookie" -H "X-Filename: $name" -H "Content-Type: application/pdf" --data-binary @"$file" "$BASE/api/papers/upload" >/tmp/e2e-paper.json
printf 'responded in %.2fs: ' "$(echo "$(date +%s.%N) - $start" | bc)"
json '`id=${j.paper?.id} duplicate=${j.duplicate} stage=${j.paper?.stage} error=${j.error||"-"}`' </tmp/e2e-paper.json
id=$(json 'j.paper?.id ?? ""' </tmp/e2e-paper.json)
[ -n "$id" ] || exit 1

echo "== not-a-PDF is rejected: $(printf 'hello' | curl -s -X POST -H "$cookie" -H "X-Filename: x.pdf" --data-binary @- "$BASE/api/papers/upload")"

echo "== Range serving"
size=$(stat -c %s "$file")
echo "whole file:   $(curl -s -o /dev/null -w '%{http_code} %{size_download} bytes' -H "$cookie" "$BASE/api/papers/$id/file") (expected $size)"
echo "first 1 KB:   $(curl -s -o /dev/null -D - -H "$cookie" -H 'Range: bytes=0-1023' "$BASE/api/papers/$id/file" | grep -iE '^(HTTP|content-range|content-length)' | tr -d '\r' | tr '\n' ' ')"
echo "last 500 B:   $(curl -s -o /dev/null -D - -H "$cookie" -H 'Range: bytes=-500' "$BASE/api/papers/$id/file" | grep -iE '^(HTTP|content-range)' | tr -d '\r' | tr '\n' ' ')"
echo "past the end: $(curl -s -o /dev/null -w '%{http_code}' -H "$cookie" -H "Range: bytes=$((size + 10))-" "$BASE/api/papers/$id/file")"
echo "bytes match:  $( [ "$(curl -s -H "$cookie" -H 'Range: bytes=100-299' "$BASE/api/papers/$id/file" | sha256sum | cut -c1-16)" = "$(tail -c +101 "$file" | head -c 200 | sha256sum | cut -c1-16)" ] && echo yes || echo NO)"
echo "no login:     $(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/papers/$id/file")"

echo "== pipeline"
for _ in $(seq 120); do
  stage=$(curl -s -H "$cookie" "$BASE/api/papers/$id" | json 'j.paper.stage + (j.paper.stageError ? " — " + j.paper.stageError : "")')
  case "$stage" in READY*|FAILED*|NEEDS_KEY*) break;; esac
  sleep 1
done
printf 'finished as: %s (%.1fs after upload)\n' "$stage" "$(echo "$(date +%s.%N) - $start" | bc)"

curl -s -H "$cookie" "$BASE/api/papers/$id" | json '
  const p=j.paper;
  [`title:    ${p.title}`, `authors:  ${p.authors.slice(0,4).join("; ")}${p.authors.length>4?" …(+"+(p.authors.length-4)+")":""}`,
   `venue:    ${p.venue} (${p.year})   doi: ${p.doi}   lang: ${p.language}   pages: ${p.pageCount}`,
   `abstract: ${(p.abstract||"").slice(0,160)}…`,
   `outline:  ${j.outline.map(o=>o.title+"@p"+o.page).join(" | ").slice(0,300)}`].join("\n")'

url=$(grep -hE '^DATABASE_URL=' .env.local | cut -d= -f2- | tr -d '"'); pw=$(sed -E 's#.*://[^:]+:([^@]+)@.*#\1#' <<<"$url")
MYSQL_PWD="$pw" mysql -u aireadbook aireadbook -t -e "
  SELECT (SELECT COUNT(*) FROM paper_pages WHERE paper_id=$id) pages,
         (SELECT SUM(is_ocr) FROM paper_pages WHERE paper_id=$id) ocr_pages,
         (SELECT COUNT(*) FROM chunks WHERE paper_id=$id) chunks,
         (SELECT COUNT(*) FROM embeddings e JOIN chunks c ON c.id=e.chunk_id WHERE c.paper_id=$id) embedded,
         (SELECT ROUND(AVG(CHAR_LENGTH(text))) FROM chunks WHERE paper_id=$id) avg_chars,
         (SELECT COUNT(DISTINCT section) FROM chunks WHERE paper_id=$id) sections;
  SELECT ordinal, page_start p, LEFT(section,28) section, LEFT(REPLACE(text,'\n',' '),90) text FROM chunks WHERE paper_id=$id ORDER BY ordinal LIMIT 4;"

echo "== same PDF again is recognised: $(curl -s -X POST -H "$cookie" -H "X-Filename: $name" --data-binary @"$file" "$BASE/api/papers/upload" | json '`duplicate=${j.duplicate} id=${j.paper?.id}`')"

if [ "$keep" != "--keep" ]; then
  echo "== cleanup: $(curl -s -X DELETE -H "$cookie" "$BASE/api/papers/$id")  rows left: $(MYSQL_PWD="$pw" mysql -u aireadbook aireadbook -N -e "SELECT COUNT(*) FROM chunks WHERE paper_id=$id")"
fi
rm -f /tmp/e2e-paper.json
