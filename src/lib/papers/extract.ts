import { execFile } from "child_process";
import { randomUUID } from "crypto";
import { mkdir, readFile, rm } from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import { parseBboxLayout, type ExtractedPage, type LayoutLine } from "@/lib/papers/bbox-layout";

const run = promisify(execFile);

/**
 * Turns a PDF into per-page text with line boxes — once, at upload. Runs
 * poppler and tesseract as child processes, so nothing here blocks the
 * server's event loop however large the file is.
 */

const OCR_DPI = 200;
/** A page with less text than this is treated as a scan and sent to OCR. */
const MIN_TEXT_CHARS = 50;
const MAX_OCR_PAGES = 400;

export interface PdfInfo {
  pages: number;
  title: string | null;
  author: string | null;
  subject: string | null;
  keywords: string | null;
  encrypted: boolean;
}

export async function pdfInfo(file: string): Promise<PdfInfo> {
  const { stdout } = await run("pdfinfo", ["-enc", "UTF-8", file], { maxBuffer: 4 << 20, timeout: 60_000 });
  const field = (name: string) => stdout.match(new RegExp(`^${name}:\\s*(.+)$`, "m"))?.[1].trim() || null;
  return {
    pages: Number(field("Pages")) || 0,
    title: field("Title"),
    author: field("Author"),
    subject: field("Subject"),
    keywords: field("Keywords"),
    encrypted: /^yes/i.test(field("Encrypted") ?? ""),
  };
}

/** tesseract's TSV → the same line shape the text layer gives, in PDF points. */
export function parseTesseractTsv(tsv: string, scale: number) {
  interface Line { words: string[]; x0: number; y0: number; x1: number; y1: number; block: string }
  const lines = new Map<string, Line>();
  for (const row of tsv.split("\n").slice(1)) {
    const cols = row.split("\t");
    if (cols.length < 12 || cols[0] !== "5") continue; // level 5 = word
    const text = cols.slice(11).join("\t").trim();
    if (!text || Number(cols[10]) < 0) continue;
    const [left, top, width, height] = cols.slice(6, 10).map(Number);
    const key = cols.slice(1, 5).join("-"); // page, block, paragraph, line
    const line = lines.get(key);
    if (!line) lines.set(key, { words: [text], x0: left, y0: top, x1: left + width, y1: top + height, block: `${cols[1]}-${cols[2]}-${cols[3]}` });
    else {
      line.words.push(text);
      line.x0 = Math.min(line.x0, left); line.y0 = Math.min(line.y0, top);
      line.x1 = Math.max(line.x1, left + width); line.y1 = Math.max(line.y1, top + height);
    }
  }

  const CJK = /[⺀-鿿豈-﫿＀-￯]/;
  let text = "";
  const out: LayoutLine[] = [];
  const blocks: ExtractedPage["blocks"] = [];
  let currentBlock: string | null = null;
  let blockStart = 0;
  let blockLines = 0;
  let blockHeight = 0;
  const closeBlock = () => { if (blockLines) blocks.push({ s: blockStart, e: text.length, lineCount: blockLines, lineHeight: blockHeight }); };

  for (const line of lines.values()) {
    let joined = "";
    for (const w of line.words) joined += (joined && !(CJK.test(joined.slice(-1)) && CJK.test(w[0])) ? " " : "") + w;
    if (line.block !== currentBlock) {
      closeBlock();
      if (text) text += "\n\n";
      currentBlock = line.block; blockStart = text.length; blockLines = 0; blockHeight = 0;
    } else if (text && !(CJK.test(text.slice(-1)) && CJK.test(joined[0]))) {
      text += " ";
    }
    const s = text.length;
    text += joined;
    const round = (n: number) => Math.round(n * scale * 100) / 100;
    out.push({ s, e: text.length, b: [round(line.x0), round(line.y0), round(line.x1), round(line.y1)] });
    blockLines++;
    blockHeight = Math.max(blockHeight, (line.y1 - line.y0) * scale);
  }
  closeBlock();
  return { text, lines: out, blocks };
}

async function ocrPage(file: string, pageNo: number, workDir: string) {
  const prefix = path.join(workDir, `ocr-${pageNo}`);
  await run("pdftoppm", ["-r", String(OCR_DPI), "-f", String(pageNo), "-l", String(pageNo), "-png", "-singlefile", file, prefix], { timeout: 120_000 });
  const { stdout } = await run("tesseract", [`${prefix}.png`, "stdout", "-l", "chi_sim+eng", "tsv"], { maxBuffer: 64 << 20, timeout: 300_000 });
  await rm(`${prefix}.png`, { force: true });
  return parseTesseractTsv(stdout, 72 / OCR_DPI);
}

export async function extractPdf(
  file: string,
  onProgress?: (done: number, total: number, phase: "text" | "ocr") => void | Promise<void>,
): Promise<ExtractedPage[]> {
  const workDir = path.join(os.tmpdir(), `aireadbook-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });
  try {
    const xhtml = path.join(workDir, "layout.html");
    await run("pdftotext", ["-bbox-layout", "-enc", "UTF-8", file, xhtml], { timeout: 600_000 });
    const pages = parseBboxLayout(await readFile(xhtml, "utf8"));
    await onProgress?.(pages.length, pages.length, "text");

    // Scanned pages have no text layer; read them with OCR instead.
    const scanned = pages.filter((page) => page.text.replace(/\s/g, "").length < MIN_TEXT_CHARS).slice(0, MAX_OCR_PAGES);
    for (const [i, page] of scanned.entries()) {
      try {
        const ocr = await ocrPage(file, page.pageNo, workDir);
        if (ocr.text.replace(/\s/g, "").length >= MIN_TEXT_CHARS) Object.assign(page, ocr, { isOcr: true });
      } catch (error) {
        console.warn(`[papers] OCR failed on page ${page.pageNo}`, (error as Error).message);
      }
      await onProgress?.(i + 1, scanned.length, "ocr");
    }
    return pages;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export type ExtractedPageWithOcr = ExtractedPage & { isOcr?: boolean };
