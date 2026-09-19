/** [x0, y0, x1, y1] in PDF points, origin top-left. */
export type PageBox = [number, number, number, number];

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * One box per run of text per line. A browser reports a selection as a box for
 * every word — often twice, once for the element and once for its line box —
 * and painted as they are, the overlaps show as darker patches. Boxes on the
 * same line that touch (or are a word space apart) become one; a wide gap, such
 * as the gutter between two columns, keeps them apart.
 */
export function mergeLineBoxes(boxes: PageBox[]): PageBox[] {
  const lines: PageBox[][] = [];
  for (const box of [...boxes].sort((a, b) => (a[1] + a[3]) - (b[1] + b[3]))) {
    const height = box[3] - box[1];
    if (height <= 0 || box[2] <= box[0]) continue;
    // Same line: the vertical overlap covers most of the shorter of the two.
    const line = lines.find((members) => {
      const top = median(members.map((m) => m[1]));
      const bottom = median(members.map((m) => m[3]));
      const overlap = Math.min(bottom, box[3]) - Math.max(top, box[1]);
      return overlap > 0.6 * Math.min(bottom - top, height);
    });
    if (line) line.push(box); else lines.push([box]);
  }

  const merged: PageBox[] = [];
  for (const members of lines) {
    const top = median(members.map((m) => m[1]));
    const bottom = median(members.map((m) => m[3]));
    const gap = 0.6 * (bottom - top);
    let run: PageBox | null = null;
    for (const box of members.sort((a, b) => a[0] - b[0])) {
      if (run && box[0] <= run[2] + gap) run[2] = Math.max(run[2], box[2]);
      else merged.push((run = [box[0], top, box[2], bottom]));
    }
  }
  return merged.map((box) => box.map((n) => Math.round(n * 100) / 100) as PageBox);
}
