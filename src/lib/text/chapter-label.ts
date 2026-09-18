/**
 * Some public-domain EPUBs reuse a publisher label (for example “传硕公版书”)
 * as the title of every chapter, and some have no titles at all. A usable
 * name is then taken from the first short heading-like line of the text.
 */

const JUNK_TITLE = /(公版书|电子书|ebook|untitled|无标题)/i;
const NOT_A_HEADING = /^(关于我们|制作说明|版权|版权信息|目录|封面|扉页)$/;

export function isJunkTitle(title: string | null | undefined) {
  const trimmed = title?.trim();
  return !trimmed || JUNK_TITLE.test(trimmed);
}

/** The first line of `text` that looks like a heading, or null. */
export function deriveTitle(text: string, currentTitle?: string | null) {
  return (
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) =>
        line.length >= 2 &&
        line.length <= 40 &&
        line !== currentTitle?.trim() &&
        !/^https?:\/\//i.test(line) &&
        !JUNK_TITLE.test(line) &&
        !NOT_A_HEADING.test(line),
      ) ?? null
  );
}

export function chapterLabel(chapter: { index: number; title: string | null; content?: string }): string {
  if (isJunkTitle(chapter.title)) {
    const derived = deriveTitle(chapter.content ?? "", chapter.title);
    if (derived) return derived;
  }
  return chapter.title?.trim() || `第${chapter.index + 1}章`;
}
