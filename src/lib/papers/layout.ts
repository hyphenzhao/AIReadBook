import { gunzipSync } from "zlib";
import { prisma } from "@/lib/prisma";
import { boxesForRange, type Box, type LayoutLine } from "@/lib/papers/bbox-layout";

export interface PageBoxes {
  page: number;
  boxes: Box[];
}

/**
 * Where a character range of a paper's full text sits on its pages, as boxes
 * in PDF points. This is what lets an AI citation highlight the passage in the
 * PDF without the PDF being parsed again: the layout was stored at upload.
 */
export async function passageBoxes(paperId: number, charStart: number, charEnd: number): Promise<PageBoxes[]> {
  // Pages are contiguous in the full text, so the ones touching the range are
  // those starting before its end whose text reaches past its start.
  const pages = await prisma.paperPage.findMany({
    where: { paperId, charStart: { lt: charEnd } },
    orderBy: { pageNo: "desc" },
    take: 4,
    select: { pageNo: true, charStart: true, text: true, layout: true },
  });

  const out: PageBoxes[] = [];
  for (const page of pages.reverse()) {
    const pageEnd = page.charStart + page.text.length;
    if (pageEnd <= charStart) continue;
    let lines: LayoutLine[];
    try {
      lines = JSON.parse(gunzipSync(page.layout).toString("utf8"));
    } catch {
      continue;
    }
    const boxes = boxesForRange(lines, Math.max(0, charStart - page.charStart), Math.min(page.text.length, charEnd - page.charStart));
    if (boxes.length) out.push({ page: page.pageNo, boxes });
  }
  return out;
}
