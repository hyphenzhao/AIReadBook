/**
 * EPUB Parser — extracts metadata, TOC, and chapter content from EPUB files.
 *
 * This uses a lightweight, server-side parsing approach:
 * 1. Unzip the EPUB (it's just a ZIP file)
 * 2. Parse container.xml, .opf, and .ncx/toc files
 * 3. Extract chapter HTML content
 * 4. Strip HTML tags to get plain text for AI processing
 */

export interface EpubMetadata {
  title: string;
  creator: string;
  language: string;
  publisher?: string;
  date?: string;
  description?: string;
  coverHref?: string;
}

export interface EpubChapter {
  index: number;
  title: string;
  href: string;
  htmlContent: string;
  plainText: string;
}

export interface EpubBook {
  metadata: EpubMetadata;
  chapters: EpubChapter[];
  coverData: ArrayBuffer | null;
}

/**
 * Parse an EPUB file and extract its contents.
 * @param fileBuffer - The raw EPUB file as ArrayBuffer
 */
export async function parseEpub(fileBuffer: ArrayBuffer): Promise<EpubBook> {
  // Dynamic import of JSZip to avoid server-side issues
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(fileBuffer);

  // Step 1: Find container.xml to locate the OPF file
  const containerXml = await zip.file("META-INF/container.xml")?.async("text");
  if (!containerXml) throw new Error("Invalid EPUB: missing container.xml");

  const opfPath = extractOpfPath(containerXml);
  if (!opfPath) throw new Error("Invalid EPUB: could not find OPF path");

  // Step 2: Parse OPF file for metadata and spine
  const opfDir = opfPath.substring(0, opfPath.lastIndexOf("/") + 1);
  const opfXml = await zip.file(opfPath)?.async("text");
  if (!opfXml) throw new Error("Invalid EPUB: missing OPF file");

  const metadata = extractMetadata(opfXml);
  const spineItems = extractSpine(opfXml);
  const manifestItems = extractManifest(opfXml);

  // Step 3: Extract chapters from spine items
  const chapters: EpubChapter[] = [];
  for (let i = 0; i < spineItems.length; i++) {
    const idref = spineItems[i];
    const href = manifestItems[idref];
    if (!href) continue;

    const fullPath = opfDir + href;
    const htmlContent = await zip.file(fullPath)?.async("text");
    if (!htmlContent) continue;

    // Extract title from HTML or use TOC
    const title = extractTitleFromHtml(htmlContent) || `第 ${i + 1} 章`;
    const plainText = stripHtml(htmlContent);

    // Skip empty chapters
    if (plainText.trim().length < 50) continue;

    chapters.push({
      index: chapters.length,
      title,
      href: fullPath,
      htmlContent,
      plainText,
    });
  }

  // Step 4: Try to extract cover image
  let coverData: ArrayBuffer | null = null;
  if (metadata.coverHref) {
    const coverPath = opfDir + metadata.coverHref;
    coverData = await zip.file(coverPath)?.async("arraybuffer") ?? null;
  }

  return { metadata, chapters, coverData };
}

// --- XML Parsing Helpers ---

function extractOpfPath(containerXml: string): string | null {
  const match = containerXml.match(/full-path="([^"]+)"/);
  return match ? match[1] : null;
}

function extractMetadata(opfXml: string): EpubMetadata {
  const getTag = (tag: string) => {
    const match = opfXml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i"));
    return match ? match[1].trim() : "";
  };

  // Extract cover image ID
  const coverMatch = opfXml.match(/<meta[^>]*name="cover"[^>]*content="([^"]*)"/i);
  const coverId = coverMatch ? coverMatch[1] : null;
  let coverHref: string | undefined;
  if (coverId) {
    const hrefMatch = opfXml.match(
      new RegExp(`<item[^>]*id="${coverId}"[^>]*href="([^"]*)"`, "i"),
    );
    coverHref = hrefMatch ? hrefMatch[1] : undefined;
  }

  return {
    title: getTag("dc:title"),
    creator: getTag("dc:creator"),
    language: getTag("dc:language") || "zh",
    publisher: getTag("dc:publisher") || undefined,
    date: getTag("dc:date") || undefined,
    description: getTag("dc:description") || undefined,
    coverHref,
  };
}

function extractSpine(opfXml: string): string[] {
  const items: string[] = [];
  const regex = /<itemref[^>]*idref="([^"]*)"/gi;
  let match;
  while ((match = regex.exec(opfXml)) !== null) {
    items.push(match[1]);
  }
  return items;
}

function extractManifest(opfXml: string): Record<string, string> {
  const items: Record<string, string> = {};
  const regex = /<item[^>]*id="([^"]*)"[^>]*href="([^"]*)"/gi;
  let match;
  while ((match = regex.exec(opfXml)) !== null) {
    items[match[1]] = match[2];
  }
  return items;
}

function extractTitleFromHtml(html: string): string | null {
  // Try <title> tag first (often includes book name, so check length)
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (titleMatch && titleMatch[1].trim().length < 80) return titleMatch[1].trim();

  // Try all heading levels in order
  for (const level of [1, 2, 3, 4]) {
    const hMatch = html.match(new RegExp(`<h${level}[^>]*>([^<]*)</h${level}>`, "i"));
    if (hMatch && hMatch[1].trim()) return hMatch[1].trim();
  }

  // Try common chapter title patterns
  const chapterMatch = html.match(/(?:第[一二三四五六七八九十百千\d]+[章节回卷篇部])\s*[^\n<]*/);
  if (chapterMatch) return chapterMatch[0].trim();

  return null;
}

function stripHtml(html: string): string {
  // Remove scripts and styles entirely
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");

  // Preserve paragraph structure: add newlines for block elements
  text = text.replace(/<\/?(p|div|section|article|h[1-6]|li|blockquote|pre|table|tr)[^>]*>/gi, "\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/?(ul|ol|dl|hr|figure)[^>]*>/gi, "\n");

  // Remove remaining HTML tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode HTML entities
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, " ");
  text = text.replace(/&ldquo;/g, "“");
  text = text.replace(/&rdquo;/g, "”");
  text = text.replace(/&mdash;/g, "—");
  text = text.replace(/&hellip;/g, "…");

  // Collapse multiple newlines (max 2)
  text = text.replace(/\n{3,}/g, "\n\n");
  // Trim each line but preserve paragraph breaks
  text = text.split("\n").map((l) => l.trim()).join("\n");
  // Remove leading/trailing whitespace
  text = text.trim();

  return text;
}
