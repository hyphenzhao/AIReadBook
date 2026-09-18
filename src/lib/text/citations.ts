/**
 * Citation markers in AI answers. The pipeline labels every passage it hands
 * the model (〔c481〕 for book text, 〔w2〕 for a web result) and the model is
 * told to cite them as [c481]; this turns those markers into links the
 * renderer can replace with chips.
 */

export const CITE_PREFIX = "#cite-";
// [c481], [w2], and the sloppier forms models produce: [#c481], 〔c481〕, [c481, c502].
const MARKER = /[\[〔【]\s*((?:#?[cw]\d+)(?:\s*[,，、]\s*#?[cw]\d+)*)\s*[\]〕】]/g;

/** Rewrites citation markers as markdown links to `#cite-<id>`. */
export function linkifyCitations(content: string) {
  return content.replace(MARKER, (_match, group: string) =>
    group
      .split(/[,，、]/)
      .map((raw) => raw.trim().replace(/^#/, ""))
      .map((id) => `[${id}](${CITE_PREFIX}${id})`)
      .join(""),
  );
}
