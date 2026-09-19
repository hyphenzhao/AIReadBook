import { splitAuthors } from "@/lib/papers/structure";

/**
 * Bibliographic metadata from Crossref (by DOI) and arXiv (by id). Both are
 * best-effort: the server may have no route to them, and a paper must still
 * be usable with whatever the PDF itself yields.
 */

export interface PaperMetadata {
  title?: string;
  authors?: string[];
  year?: number;
  venue?: string;
  abstract?: string;
  doi?: string;
  arxivId?: string;
}

const TIMEOUT_MS = 8000;
const USER_AGENT = "AIReadBook/1.0 (self-hosted reading assistant)";

const clean = (text: unknown) => String(text ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

export async function fetchCrossref(doi: string): Promise<PaperMetadata | null> {
  try {
    const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const work = (await res.json())?.message;
    if (!work) return null;
    const year = work.issued?.["date-parts"]?.[0]?.[0] ?? work.published?.["date-parts"]?.[0]?.[0];
    return {
      doi: doi.toLowerCase(),
      title: clean(work.title?.[0]) || undefined,
      authors: Array.isArray(work.author)
        ? work.author.map((a: any) => clean([a.given, a.family].filter(Boolean).join(" ") || a.name)).filter(Boolean)
        : undefined,
      year: Number.isInteger(year) ? year : undefined,
      venue: clean(work["container-title"]?.[0]) || undefined,
      abstract: clean(work.abstract) || undefined,
    };
  } catch {
    return null;
  }
}

const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1];

/** Parses the first <entry> of an arXiv Atom response. */
export function parseArxivAtom(xml: string, arxivId: string): PaperMetadata | null {
  const entry = tag(xml, "entry");
  const title = entry && clean(tag(entry, "title"));
  // An unknown id still returns an entry, titled "Error".
  if (!entry || !title || title === "Error") return null;
  const year = Number(tag(entry, "published")?.slice(0, 4));
  return {
    arxivId,
    title,
    authors: [...entry.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>/g)].map((m) => clean(m[1])).filter(Boolean),
    year: Number.isInteger(year) && year > 1900 ? year : undefined,
    venue: "arXiv",
    abstract: clean(tag(entry, "summary")) || undefined,
    doi: clean(tag(entry, "arxiv:doi"))?.toLowerCase() || undefined,
  };
}

export async function fetchArxiv(arxivId: string): Promise<PaperMetadata | null> {
  try {
    const bare = arxivId.replace(/v\d+$/, "");
    const res = await fetch(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(bare)}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok ? parseArxivAtom(await res.text(), bare) : null;
  } catch {
    return null;
  }
}

export const arxivPdfUrl = (arxivId: string) => `https://arxiv.org/pdf/${arxivId.replace(/v\d+$/, "")}`;

/** A PDF's own Title field is often a file name, a template name, or empty. */
export function plausibleTitle(title: string | null | undefined) {
  const t = title?.trim();
  if (!t || t.length < 8 || t.length > 400) return null;
  if (/\.(pdf|docx?|tex|indd|dvi)$/i.test(t) || /^(untitled|microsoft word|document\d*|slide \d+)/i.test(t)) return null;
  return t;
}

/** Authors from the PDF's Author field, when it looks like names rather than a username. */
export function plausibleAuthors(author: string | null | undefined) {
  const names = splitAuthors(author);
  return names.length && names.every((name) => /[\s一-鿿.]/.test(name) || names.length > 1) ? names : [];
}
