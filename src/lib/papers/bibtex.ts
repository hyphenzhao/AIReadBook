/**
 * Reads and writes BibTeX. The reader copes with what reference managers
 * really export: nested braces, quoted values, `#` concatenation, @string
 * macros, LaTeX accents and escapes, and entries it has no use for.
 */

export interface BibEntry {
  type: string;
  key: string;
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  doi: string | null;
  arxivId: string | null;
  abstract: string | null;
}

const ACCENTS: Record<string, Record<string, string>> = {
  "'": { a: "á", e: "é", i: "í", o: "ó", u: "ú", y: "ý", c: "ć", n: "ń", s: "ś", z: "ź", A: "Á", E: "É", I: "Í", O: "Ó", U: "Ú" },
  "`": { a: "à", e: "è", i: "ì", o: "ò", u: "ù", A: "À", E: "È", O: "Ò" },
  "^": { a: "â", e: "ê", i: "î", o: "ô", u: "û", A: "Â", E: "Ê", O: "Ô" },
  '"': { a: "ä", e: "ë", i: "ï", o: "ö", u: "ü", A: "Ä", O: "Ö", U: "Ü" },
  "~": { a: "ã", n: "ñ", o: "õ", A: "Ã", N: "Ñ", O: "Õ" },
  c: { c: "ç", C: "Ç" },
  v: { c: "č", s: "š", z: "ž", r: "ř", e: "ě", C: "Č", S: "Š", Z: "Ž" },
};

/** LaTeX → plain text: accents, escapes, and the braces used to protect capitals. */
export function delatex(value: string) {
  return value
    .replace(/\\([`'^"~cv])\s*\{?\\?([A-Za-z])\}?/g, (match, accent: string, letter: string) => ACCENTS[accent]?.[letter] ?? letter)
    .replace(/\\ss\b\s?/g, "ß").replace(/\\o\b\s?/g, "ø").replace(/\\O\b\s?/g, "Ø").replace(/\\aa\b\s?/g, "å").replace(/\\l\b\s?/g, "ł")
    .replace(/\\([&%$#_{}])/g, "$1")
    .replace(/\\(?:emph|textit|textbf|textrm|mathrm|text)\s*\{([^{}]*)\}/g, "$1")
    .replace(/~/g, " ")
    .replace(/--+/g, "–")
    .replace(/[{}]/g, "")
    .replace(/\\[A-Za-z]+\s?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** "Last, First and First Last and {Consortium Name}" → ["First Last", …]. */
export function parseBibAuthors(value: string) {
  return value
    .split(/\s+and\s+/i)
    .map((name) => {
      const protectedName = /^\{.*\}$/.test(name.trim());
      const clean = delatex(name);
      if (protectedName || !clean.includes(",")) return clean;
      const [last, first, ...rest] = clean.split(",").map((part) => part.trim());
      return [first, ...rest, last].filter(Boolean).join(" ");
    })
    .filter((name) => name && name.toLowerCase() !== "others");
}

/** Reads one `{…}` or `"…"` or bare token starting at `i`; returns the raw value and the next index. */
function readValue(text: string, start: number, macros: Record<string, string>): [string, number] {
  let i = start;
  let out = "";
  for (;;) {
    while (/\s/.test(text[i] ?? "")) i++;
    if (text[i] === "{") {
      let depth = 0;
      const from = i + 1;
      for (; i < text.length; i++) {
        if (text[i] === "\\") { i++; continue; }
        if (text[i] === "{") depth++;
        else if (text[i] === "}" && --depth === 0) break;
      }
      out += text.slice(from, i);
      i++;
    } else if (text[i] === '"') {
      let depth = 0;
      const from = ++i;
      for (; i < text.length; i++) {
        if (text[i] === "\\") { i++; continue; }
        if (text[i] === "{") depth++;
        else if (text[i] === "}") depth--;
        else if (text[i] === '"' && depth === 0) break;
      }
      out += text.slice(from, i);
      i++;
    } else {
      const token = text.slice(i).match(/^[^\s,#}]+/)?.[0] ?? "";
      out += macros[token.toLowerCase()] ?? token;
      i += token.length;
    }
    while (/\s/.test(text[i] ?? "")) i++;
    if (text[i] !== "#") return [out, i];
    i++; // concatenation
  }
}

export function parseBibtex(source: string): BibEntry[] {
  const entries: BibEntry[] = [];
  const macros: Record<string, string> = {
    jan: "January", feb: "February", mar: "March", apr: "April", may: "May", jun: "June",
    jul: "July", aug: "August", sep: "September", oct: "October", nov: "November", dec: "December",
  };
  const header = /@([A-Za-z]+)\s*[{(]\s*/g;

  for (let match = header.exec(source); match; match = header.exec(source)) {
    const type = match[1].toLowerCase();
    let i = header.lastIndex;
    if (type === "comment" || type === "preamble") continue;

    if (type === "string") {
      const name = source.slice(i).match(/^([A-Za-z][\w:-]*)\s*=\s*/);
      if (name) { const [value] = readValue(source, i + name[0].length, macros); macros[name[1].toLowerCase()] = value; }
      continue;
    }

    const key = source.slice(i).match(/^([^,\s}]*)\s*,/);
    if (!key) continue;
    i += key[0].length;

    const fields: Record<string, string> = {};
    for (;;) {
      while (/[\s,]/.test(source[i] ?? "")) i++;
      if (i >= source.length || source[i] === "}" || source[i] === ")") break;
      const name = source.slice(i).match(/^([A-Za-z][\w:-]*)\s*=\s*/);
      if (!name) break;
      const [value, next] = readValue(source, i + name[0].length, macros);
      fields[name[1].toLowerCase()] = value;
      i = next;
    }
    header.lastIndex = i;

    const title = delatex(fields.title ?? "");
    if (!title) continue;
    const year = Number((fields.year ?? fields.date ?? "").match(/\d{4}/)?.[0]);
    const eprint = fields.archiveprefix?.toLowerCase() === "arxiv" || /arxiv/i.test(fields.journal ?? "") ? fields.eprint : undefined;
    entries.push({
      type,
      key: key[1],
      title,
      authors: parseBibAuthors(fields.author ?? fields.editor ?? ""),
      year: Number.isInteger(year) && year > 0 ? year : null,
      venue: delatex(fields.journal ?? fields.journaltitle ?? fields.booktitle ?? fields.publisher ?? fields.school ?? "") || null,
      doi: fields.doi ? delatex(fields.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").toLowerCase() : null,
      arxivId: eprint ? delatex(eprint).replace(/^arxiv:/i, "") : null,
      abstract: fields.abstract ? delatex(fields.abstract) : null,
    });
  }
  return entries;
}

const escapeBib = (value: string) => value.replace(/([&%$#_])/g, "\\$1");

/** A citation key in the usual style: firstauthor + year + first title word. */
export function citationKey(paper: { authors: string[]; year: number | null; title: string }, taken: Set<string>) {
  const surname = (paper.authors[0] ?? "anon").trim().split(/\s+/).pop() ?? "anon";
  const word = paper.title.split(/\s+/).find((w) => w.replace(/\W/g, "").length > 3) ?? "paper";
  const ascii = (text: string) => text.normalize("NFKD").replace(/[^\x20-\x7e]/g, "").replace(/[^A-Za-z0-9]/g, "").toLowerCase();
  const base = `${ascii(surname) || "anon"}${paper.year ?? ""}${ascii(word) || "paper"}`;
  let key = base;
  for (let n = 2; taken.has(key); n++) key = `${base}${n}`;
  taken.add(key);
  return key;
}

export function toBibtex(papers: { title: string; authors: string[]; year: number | null; venue: string | null; doi: string | null; arxivId: string | null; abstract?: string | null }[]) {
  const taken = new Set<string>();
  return papers.map((paper) => {
    const isPreprint = !!paper.arxivId && (!paper.venue || /arxiv/i.test(paper.venue));
    const fields: [string, string | null | undefined][] = [
      // Double braces keep the title's capitalisation as written.
      ["title", `{${escapeBib(paper.title)}}`],
      ["author", paper.authors.map(escapeBib).join(" and ")],
      ["year", paper.year ? String(paper.year) : null],
      [isPreprint ? "" : "journal", isPreprint ? null : paper.venue && escapeBib(paper.venue)],
      ["doi", paper.doi],
      ["eprint", paper.arxivId],
      ["archivePrefix", paper.arxivId ? "arXiv" : null],
    ];
    const body = fields.filter(([name, value]) => name && value).map(([name, value]) => `  ${name} = {${value}}`).join(",\n");
    return `@${isPreprint ? "misc" : "article"}{${citationKey(paper, taken)},\n${body}\n}`;
  }).join("\n\n") + "\n";
}
