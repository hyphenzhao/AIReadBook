import { uuid } from "@/lib/utils";
import { NextRequest, NextResponse } from "next/server";
import { parseEpub } from "@/lib/epub/parser";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!file.name.endsWith(".epub")) {
      return NextResponse.json({ error: "Only EPUB files are supported" }, { status: 400 });
    }

    if (file.size > 100 * 1024 * 1024) {
      return NextResponse.json({ error: "File size must be under 100MB" }, { status: 400 });
    }

    // Parse the EPUB file
    const buffer = await file.arrayBuffer();
    const epubData = await parseEpub(buffer);

    // For MVP: store book data in the response directly
    // In production, this would save to Supabase and trigger AI processing
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

export async function GET() {
  // In production, fetch from Supabase
  // For MVP, return empty array
  return NextResponse.json({ books: [] });
}
