import { NextRequest, NextResponse } from "next/server";
import { searchAllSources } from "@/lib/search/external-books";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");
  if (!q || q.trim().length < 2) {
    return NextResponse.json({ results: [] });
  }
  if (q.trim().length > 200) {
    return NextResponse.json({ results: [], error: "Query too long" }, { status: 400 });
  }

  try {
    const results = await searchAllSources(q.trim());
    return NextResponse.json({ results });
  } catch (error) {
    console.error("External search error:", error);
    return NextResponse.json({ results: [], error: "Search failed" }, { status: 500 });
  }
}
