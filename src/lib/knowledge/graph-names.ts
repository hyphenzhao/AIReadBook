/**
 * Name handling for knowledge-graph nodes. Kept free of database and network
 * imports so the merge rules can be unit-tested on their own.
 */

export const BOOK_NODE_TYPES = ["concept", "person", "place", "event", "work", "argument"] as const;
export type BookNodeType = (typeof BOOK_NODE_TYPES)[number];

export const NODE_TYPE_LABELS: Record<string, string> = {
  concept: "概念",
  person: "人物",
  place: "地点",
  event: "事件",
  work: "著作",
  argument: "观点",
  paper: "文献",
  keyword: "关键词",
  method: "方法",
  dataset: "数据集",
  conclusion: "结论",
};

/** Above this, two nodes of the same type are the same thing: merge automatically. */
export const AUTO_MERGE_SIMILARITY = 0.9;

/**
 * The merge key: NFKC (full-width → half-width, compatibility forms), lower
 * case, and no whitespace, punctuation or symbols. "《史记》", "史记 " and
 * "史 記" differ only in the last respect handled here; variant characters
 * are left to the embedding comparison.
 */
export function normalizeName(name: string) {
  return name.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "").slice(0, 200);
}

/** Every distinct, non-empty normalised form of a name and its aliases. */
export function normalizedForms(name: string, aliases: string[] = []) {
  return [...new Set([name, ...aliases].map(normalizeName).filter(Boolean))];
}

/** The text embedded to compare two nodes: the name carries most of the weight. */
export function nodeEmbeddingText(name: string, description?: string | null) {
  return description?.trim() ? `${name}：${description.trim().slice(0, 200)}` : name;
}
