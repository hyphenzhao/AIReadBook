import { generateObject } from "ai";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserLLM } from "@/lib/ai/user-llm";
import { cosine } from "@/lib/vector";
import { paperCentroids } from "@/lib/vector/papers";
import { normalizeName } from "@/lib/knowledge/graph-names";
import type { PaperAnalysisData } from "@/lib/papers/analyze";
import type { JobContext } from "@/lib/jobs/worker";

/**
 * Relations between one paper and the rest of the library.
 *
 *  1. From the graph: papers that point at the same keyword / method / dataset
 *     / conclusion node. Shared nodes are weighted by how rare they are in the
 *     library, so "EEG" counts for less than "targeted memory reactivation".
 *  2. From the text: overall similarity (mean chunk embedding), and citations
 *     (the other paper's DOI or title in this one's reference list).
 *  3. From the findings: for the few closest papers only, the model compares
 *     what each concludes — agrees, contradicts or extends — and must quote
 *     both sides. This is the only step that costs LLM calls.
 *
 * Links a reader added or dismissed are never touched.
 */

export const LINK_TYPES = ["SHARED_KEYWORD", "SHARED_METHOD", "SHARED_DATASET", "SIMILAR", "CITES", "AGREES", "CONTRADICTS", "EXTENDS"] as const;
export type LinkType = (typeof LINK_TYPES)[number];

const SHARED_TYPE: Record<string, LinkType> = { keyword: "SHARED_KEYWORD", method: "SHARED_METHOD", dataset: "SHARED_DATASET", conclusion: "AGREES" };
const SIMILAR_THRESHOLD = 0.78;
const SIMILAR_TOP = 3;
const JUDGE_TOP = 3;

/**
 * A node a third of the library points at describes the field, not a connection
 * between two papers: in a library about gait, "EEG" would link everything to
 * everything. Small libraries are left alone — there, every overlap is news.
 */
export function tooCommon(papersWithNode: number, paperCount: number) {
  return paperCount >= 9 && papersWithNode > paperCount / 3;
}

/**
 * "Similar" is relative. In a library on one subject every pair clears a fixed
 * threshold, so a pair is linked only when one of the two counts the other
 * among its few nearest — and the threshold still keeps unrelated papers apart.
 */
export function nearestPapers(paperId: number, centroids: Map<number, Float32Array>, top = SIMILAR_TOP) {
  const own = centroids.get(paperId);
  if (!own) return [];
  // The similarity a paper's top-th nearest neighbour has: the bar to be "among its nearest".
  const bar = (id: number, vector: Float32Array) => {
    const all: number[] = [];
    for (const [otherId, other] of centroids) if (otherId !== id) all.push(cosine(vector, other));
    all.sort((a, b) => b - a);
    return all[Math.min(top, all.length) - 1] ?? 1;
  };
  const ownBar = bar(paperId, own);
  const result: { otherId: number; similarity: number }[] = [];
  for (const [otherId, vector] of centroids) {
    if (otherId === paperId) continue;
    const similarity = cosine(own, vector);
    if (similarity < SIMILAR_THRESHOLD) continue;
    if (similarity >= ownBar || similarity >= bar(otherId, vector)) result.push({ otherId, similarity });
  }
  return result;
}

interface Draft { otherId: number; type: LinkType; score: number; evidence: Prisma.InputJsonValue; origin: "AUTO" | "LLM" }

async function upsertLinks(userId: number, paperId: number, drafts: Draft[], origins: Draft["origin"][]) {
  // Recompute this paper's automatic links from scratch; keep the reader's own
  // (and the model's verdicts, when this run did not ask for new ones).
  await prisma.paperLink.deleteMany({
    where: { userId, origin: { in: origins }, dismissed: false, OR: [{ paperAId: paperId }, { paperBId: paperId }] },
  });
  for (const draft of drafts) {
    const [paperAId, paperBId] = paperId < draft.otherId ? [paperId, draft.otherId] : [draft.otherId, paperId];
    const existing = await prisma.paperLink.findUnique({ where: { paperAId_paperBId_type: { paperAId, paperBId, type: draft.type } } });
    if (existing) continue; // dismissed, or added by hand
    await prisma.paperLink.create({
      data: { userId, paperAId, paperBId, type: draft.type, score: draft.score, evidence: draft.evidence, origin: draft.origin },
    });
  }
}

const judgeSchema = z.object({
  relation: z.enum(["AGREES", "CONTRADICTS", "EXTENDS", "UNRELATED"]),
  explanation: z.string().describe("一两句话说明为什么，点明是哪一条结论"),
  findingA: z.string().describe("文献 A 中相关的那条结论，照抄所给列表中的原句"),
  findingB: z.string().describe("文献 B 中相关的那条结论，照抄所给列表中的原句"),
});

async function judgePair(userId: number, a: { title: string; data: PaperAnalysisData }, b: { title: string; data: PaperAnalysisData }) {
  if (!a.data.findings.length || !b.data.findings.length) return null;
  const llm = await getUserLLM(userId, "structured");
  const list = (data: PaperAnalysisData) => data.findings.map((f, i) => `${i + 1}. ${f.text}`).join("\n");
  const { object } = await generateObject({
    model: llm.model,
    mode: "json",
    schema: judgeSchema,
    system: `你在比较两篇文献的结论。判断它们之间最重要的一种关系：
- AGREES：在同一个问题上得出一致的结论
- CONTRADICTS：在同一个问题上得出相反或不相容的结论
- EXTENDS：一篇在另一篇的基础上推进（新的条件、人群、机制或更强的证据）
- UNRELATED：结论之间没有实质关联。宁可判 UNRELATED，也不要牵强附会
只依据给出的结论列表，只输出 JSON。`,
    prompt: `文献 A：${a.title}\n研究问题：${a.data.researchQuestion?.text ?? "-"}\n结论：\n${list(a.data)}\n\n文献 B：${b.title}\n研究问题：${b.data.researchQuestion?.text ?? "-"}\n结论：\n${list(b.data)}`,
    temperature: llm.temperature,
    maxTokens: llm.maxTokens,
  });
  // Narrowed here, so callers only ever see a relation worth recording.
  return object.relation === "UNRELATED" ? null : { ...object, relation: object.relation };
}

/**
 * Job "relink_papers": recompute the automatic links of a whole library, e.g.
 * after the rules changed. The model's verdicts are kept and no LLM call is made.
 */
export async function relinkLibrary(userId: number, ctx: JobContext) {
  const papers = await prisma.paper.findMany({ where: { userId }, orderBy: { id: "asc" }, select: { id: true } });
  for (const [i, paper] of papers.entries()) {
    await computePaperLinks(paper.id, { judge: false });
    await ctx.progress(`relinking ${i + 1}/${papers.length}`, Math.round(((i + 1) / papers.length) * 100));
  }
}

export async function computePaperLinks(paperId: number, options: { judge?: boolean } = {}) {
  const paper = await prisma.paper.findUnique({
    where: { id: paperId },
    select: { id: true, userId: true, title: true, doi: true, graphNode: { select: { id: true } }, analysis: { select: { data: true } } },
  });
  if (!paper) return 0;
  const { userId } = paper;
  const drafts: Draft[] = [];
  const closeness = new Map<number, number>();
  const bump = (otherId: number, amount: number) => closeness.set(otherId, (closeness.get(otherId) ?? 0) + amount);

  // 1. Shared graph nodes.
  if (paper.graphNode) {
    const paperCount = Math.max(2, await prisma.graphNode.count({ where: { userId, scope: "PAPER", type: "paper" } }));
    const mine = await prisma.graphEdge.findMany({
      where: { srcId: paper.graphNode.id },
      select: { dst: { select: { id: true, type: true, name: true, inEdges: { select: { src: { select: { paperId: true } } } } } } },
    });
    const shared = new Map<string, { otherId: number; type: LinkType; score: number; nodes: { id: number; name: string }[] }>();
    for (const { dst } of mine) {
      const type = SHARED_TYPE[dst.type];
      const others = [...new Set(dst.inEdges.map((edge) => edge.src.paperId).filter((id): id is number => !!id && id !== paperId))];
      if (!type || others.length === 0 || tooCommon(others.length + 1, paperCount)) continue;
      // Inverse document frequency: a node half the library shares says little.
      const idf = Math.log(1 + paperCount / (others.length + 1));
      for (const otherId of others) {
        const key = `${otherId}|${type}`;
        const entry = shared.get(key) ?? { otherId, type, score: 0, nodes: [] };
        entry.score += idf;
        entry.nodes.push({ id: dst.id, name: dst.name });
        shared.set(key, entry);
      }
    }
    for (const entry of shared.values()) {
      drafts.push({ otherId: entry.otherId, type: entry.type, score: entry.score, evidence: { nodes: entry.nodes.slice(0, 12) }, origin: "AUTO" });
      bump(entry.otherId, entry.score);
    }
  }

  // 2a. Overall similarity of the texts.
  for (const { otherId, similarity } of nearestPapers(paperId, await paperCentroids(userId))) {
    drafts.push({ otherId, type: "SIMILAR", score: similarity, evidence: { similarity: Math.round(similarity * 1000) / 1000 }, origin: "AUTO" });
    bump(otherId, similarity);
  }

  // 2b. Citations, both ways: a DOI or a full title found in the other's text.
  const others = await prisma.paper.findMany({ where: { userId, id: { not: paperId } }, select: { id: true, title: true, doi: true } });
  const cites = async (fromId: number, target: { title: string; doi: string | null }) => {
    const title = normalizeName(target.title);
    if (!target.doi && title.length < 25) return false; // a short title would match by accident
    const pages = await prisma.paperPage.findMany({ where: { paperId: fromId }, select: { text: true } });
    const haystack = pages.map((page) => page.text).join("\n");
    if (target.doi && haystack.toLowerCase().includes(target.doi.toLowerCase())) return true;
    return title.length >= 25 && normalizeName(haystack).includes(title);
  };
  for (const other of others) {
    if (await cites(paperId, other)) { drafts.push({ otherId: other.id, type: "CITES", score: 1, evidence: { citing: paperId, cited: other.id }, origin: "AUTO" }); bump(other.id, 1.5); }
    else if (await cites(other.id, paper)) { drafts.push({ otherId: other.id, type: "CITES", score: 1, evidence: { citing: other.id, cited: paperId }, origin: "AUTO" }); bump(other.id, 1.5); }
  }

  // 3. What the closest few conclude, compared by the model.
  if (options.judge !== false && paper.analysis) {
    const nearest = [...closeness.entries()].sort((a, b) => b[1] - a[1]).slice(0, JUDGE_TOP).map(([id]) => id);
    const candidates = await prisma.paper.findMany({
      where: { id: { in: nearest }, analysis: { isNot: null } },
      select: { id: true, title: true, analysis: { select: { data: true } } },
    });
    for (const other of candidates) {
      try {
        const verdict = await judgePair(
          userId,
          { title: paper.title, data: paper.analysis.data as unknown as PaperAnalysisData },
          { title: other.title, data: other.analysis!.data as unknown as PaperAnalysisData },
        );
        if (!verdict) continue;
        drafts.push({
          otherId: other.id, type: verdict.relation, score: 2, origin: "LLM",
          evidence: { explanation: verdict.explanation, findings: { [paperId]: verdict.findingA, [other.id]: verdict.findingB } },
        });
      } catch (error) {
        console.warn(`[papers] could not compare ${paperId} with ${other.id}`, (error as Error).message);
      }
    }
  }

  // The model's reading of two conclusions outranks "they merged into one node".
  const judged = new Set(drafts.filter((d) => d.origin === "LLM").map((d) => d.otherId));
  const final = drafts.filter((d) => !(d.type === "AGREES" && d.origin === "AUTO" && judged.has(d.otherId)));
  await upsertLinks(userId, paperId, final, options.judge === false ? ["AUTO"] : ["AUTO", "LLM"]);
  return final.length;
}
