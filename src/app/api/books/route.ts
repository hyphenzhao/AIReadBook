import { uuid } from "@/lib/utils";
import { NextRequest, NextResponse } from "next/server";
import { parseEpub } from "@/lib/epub/parser";
import { getSessionUserId } from "@/lib/auth-session";

export async function POST(request: NextRequest) {
  try {
    if (!(await getSessionUserId())) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".epub")) {
      return NextResponse.json({ error: "Only EPUB files are supported" }, { status: 400 });
    }

    if (file.size > 100 * 1024 * 1024) {
      return NextResponse.json({ error: "File size must be under 100MB" }, { status: 400 });
    }

    // Parse the EPUB file
    const buffer = await file.arrayBuffer();
    const epubData = await parseEpub(buffer);
    const totalCharacters = epubData.chapters.reduce((sum, chapter) => sum + chapter.plainText.length, 0);
    if (!epubData.chapters.length) {
      return NextResponse.json({ error: "EPUB 中没有可读取的正文内容" }, { status: 422 });
    }
    if (epubData.chapters.length > 2000 || totalCharacters > 50_000_000) {
      return NextResponse.json({ error: "EPUB 解压后的内容过大" }, { status: 413 });
    }

    // Parsing is isolated from persistence so the client can show parse errors
    // before the normalized book and chapters are written through /api/v2/books.
    const book = {
      id: uuid(),
      title: epubData.metadata.title || file.name.replace(".epub", ""),
      author: epubData.metadata.creator || null,
      coverUrl: null, // Cover can be added later via custom upload
      language: epubData.metadata.language || "zh",
      totalChapters: epubData.chapters.length,
      chapters: epubData.chapters.map((ch) => ({
        id: uuid(),
        index: ch.index,
        title: ch.title,
        plainText: ch.plainText,
        wordCount: ch.plainText.length,
      })),
      metadata: {
        publisher: epubData.metadata.publisher,
        date: epubData.metadata.date,
        description: epubData.metadata.description,
      },
      uploadedAt: new Date().toISOString(),
    };

    return NextResponse.json(book);
  } catch (error) {
    console.error("EPUB upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process EPUB" },
      { status: 500 },
    );
  }
}
