// Calls the first user's configured model with a tiny prompt and prints the
// token usage breakdown, to see how much of max_tokens hidden reasoning eats.
// Prints no secrets.   Usage (on the server): node scripts/probe-llm.cjs ['{"extra":"body"}']
const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");
const fs = require("fs");

const env = fs.readFileSync(".env.local", "utf8");
const secret = env.match(/^AUTH_SECRET=(.*)$/m)[1].trim();

function open(sealed) {
  const [iv, tag, body] = sealed.slice("enc:v1:".length).split(":").map((p) => Buffer.from(p, "base64url"));
  const key = Buffer.from(crypto.hkdfSync("sha256", secret, "aireadbook", "ai-api-key", 32));
  const d = crypto.createDecipheriv("aes-256-gcm", key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]).toString("utf8");
}

(async () => {
  const prisma = new PrismaClient();
  const user = await prisma.user.findFirst({ orderBy: { id: "asc" }, select: { aiSettings: true } });
  await prisma.$disconnect();
  const s = user.aiSettings;
  const extra = process.argv[2] ? JSON.parse(process.argv[2]) : {};
  const res = await fetch(`${s.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${open(s.apiKeyEnc)}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: s.model, max_tokens: 400,
      messages: [{ role: "user", content: "用一句话解释什么是鸿门宴" }],
      ...extra,
    }),
  });
  const j = await res.json();
  const m = j.choices?.[0];
  console.log(JSON.stringify({
    status: res.status, model: s.model, extra,
    finish: m?.finish_reason,
    content: (m?.message?.content || "").slice(0, 60),
    reasoning_chars: (m?.message?.reasoning_content || "").length,
    usage: j.usage, error: j.error?.message,
  }, null, 1));
})();
