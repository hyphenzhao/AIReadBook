import { describe, expect, it } from "vitest";
import { citationKey, delatex, parseBibAuthors, parseBibtex, toBibtex } from "./bibtex";

const SAMPLE = String.raw`
@comment{exported by a reference manager}
@string{natcomm = "Nature Communications"}

@article{schonauer2017decoding,
  title   = {Decoding material-specific memory reprocessing during sleep in humans},
  author  = {Sch{\"o}nauer, Monika and Alizadeh, Sarah and Jamalabadi, Hamidreza and Abraham, Annette and Pawlizki, Annedore and Gais, Steffen},
  journal = natcomm,
  volume  = {8},
  year    = {2017},
  doi     = {https://doi.org/10.1038/NCOMMS15404},
  abstract = {Neuronal learning activity is reactivated during sleep, but the dynamics {in humans} are poorly understood.}
}

@misc{vaswani2017attention,
  title = "Attention Is All You Need",
  author = "Vaswani, Ashish and Shazeer, Noam and others",
  year = 2017,
  eprint = {1706.03762},
  archivePrefix = {arXiv},
  primaryClass = {cs.CL}
}

@inproceedings{no_title_here, author = {Nobody}, year = {2020}}

@book{zh2020,
  title = {睡眠与记忆巩固},
  author = {张三 and 李四},
  publisher = {科学出版社},
  year = {2020}
}
`;

describe("parseBibtex", () => {
  const entries = parseBibtex(SAMPLE);

  it("reads the entries that have a title and skips comments, macros and the rest", () => {
    expect(entries.map((e) => e.key)).toEqual(["schonauer2017decoding", "vaswani2017attention", "zh2020"]);
  });

  it("handles nested braces, accents, @string macros and DOI URLs", () => {
    expect(entries[0]).toMatchObject({
      type: "article",
      title: "Decoding material-specific memory reprocessing during sleep in humans",
      venue: "Nature Communications",
      year: 2017,
      doi: "10.1038/ncomms15404",
      abstract: "Neuronal learning activity is reactivated during sleep, but the dynamics in humans are poorly understood.",
    });
    expect(entries[0].authors[0]).toBe("Monika Schönauer");
    expect(entries[0].authors).toHaveLength(6);
  });

  it("handles quoted values, bare numbers, 'and others' and arXiv eprints", () => {
    expect(entries[1]).toMatchObject({ title: "Attention Is All You Need", year: 2017, arxivId: "1706.03762", doi: null });
    expect(entries[1].authors).toEqual(["Ashish Vaswani", "Noam Shazeer"]);
  });

  it("keeps Chinese entries intact", () => {
    expect(entries[2]).toMatchObject({ title: "睡眠与记忆巩固", authors: ["张三", "李四"], venue: "科学出版社" });
  });

  it("survives malformed input", () => {
    expect(parseBibtex("")).toEqual([]);
    expect(parseBibtex("@article{broken, title = {Unclosed")).toHaveLength(1);
    expect(parseBibtex("not bibtex at all")).toEqual([]);
  });
});

describe("helpers", () => {
  it("delatex removes markup and keeps the text", () => {
    expect(delatex(String.raw`{T}he \emph{role} of {EEG} \& sleep --- a 50\% gain`)).toBe("The role of EEG & sleep – a 50% gain");
    expect(delatex(String.raw`G\"{o}del, Fran\c{c}ois, \v{C}apek, Stra{\ss}e`)).toBe("Gödel, François, Čapek, Straße");
  });

  it("parseBibAuthors flips 'Last, First' and keeps protected names", () => {
    expect(parseBibAuthors("Born, Jan and Bj{\\\"o}rn Rasch and {The Sleep Consortium}")).toEqual(["Jan Born", "Björn Rasch", "The Sleep Consortium"]);
  });

  it("citationKey is ascii, stable, and unique within an export", () => {
    const taken = new Set<string>();
    const paper = { authors: ["Monika Schönauer"], year: 2017, title: "Decoding material-specific memory" };
    expect(citationKey(paper, taken)).toBe("schonauer2017decoding");
    expect(citationKey(paper, taken)).toBe("schonauer2017decoding2");
    expect(citationKey({ authors: ["张三"], year: 2020, title: "睡眠与记忆巩固" }, taken)).toBe("anon2020paper");
  });
});

describe("toBibtex", () => {
  it("round-trips through the parser", () => {
    const papers = [
      { title: "Sleep & Memory: a 50% Gain", authors: ["Jan Born", "Björn Rasch"], year: 2013, venue: "Physiological Reviews", doi: "10.1152/physrev.00032.2012", arxivId: null },
      { title: "Attention Is All You Need", authors: ["Ashish Vaswani"], year: 2017, venue: "arXiv", doi: null, arxivId: "1706.03762" },
    ];
    const bib = toBibtex(papers);
    expect(bib).toContain("@article{born2013sleep,");
    expect(bib).toContain("@misc{vaswani2017attention,");
    const parsed = parseBibtex(bib);
    expect(parsed.map((e) => [e.title, e.authors, e.year, e.doi, e.arxivId])).toEqual([
      ["Sleep & Memory: a 50% Gain", ["Jan Born", "Björn Rasch"], 2013, "10.1152/physrev.00032.2012", null],
      ["Attention Is All You Need", ["Ashish Vaswani"], 2017, null, "1706.03762"],
    ]);
  });
});
