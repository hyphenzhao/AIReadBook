import { prisma } from "@/lib/prisma";
import { deriveTitle } from "@/lib/text/chapter-label";

/**
 * Gives chapters whose title is empty or a publisher label a real name taken
 * from their text. New imports are named on the way in; this catches books
 * imported before that. Only the first 600 characters are read per chapter.
 */
export async function repairChapterTitles() {
  const rows = await prisma.$queryRaw<Array<{ id: number; title: string | null; head: string }>>`
    SELECT id, title, LEFT(content, 600) AS head
    FROM chapters
    WHERE title IS NULL OR TRIM(title) = '' OR title REGEXP '公版书|电子书|ebook|untitled|无标题'`;

  let repaired = 0;
  for (const row of rows) {
    const derived = deriveTitle(row.head, row.title);
    if (!derived) continue;
    await prisma.chapter.update({ where: { id: Number(row.id) }, data: { title: derived } });
    repaired++;
  }
  return repaired;
}
