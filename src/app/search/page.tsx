"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Search, BookOpen, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ExternalBook } from "@/lib/search/external-books";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ExternalBook[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function doSearch() {
    if (!query.trim() || query.trim().length < 2) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/search/external?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      setResults(data.results || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    if (q) {
      setQuery(q);
      // Auto search with delay
      const t = setTimeout(() => doSearch(), 100);
      return () => clearTimeout(t);
    }
  }, []);

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-6 py-4">
          <Link href="/library" className="rounded p-1 hover:bg-[var(--accent)]">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-semibold">发现书籍</h1>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-6">
        {/* Search bar */}
        <form
          onSubmit={(e) => { e.preventDefault(); doSearch(); }}
          className="mb-8 flex gap-2"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索书名、作者... (OpenLibrary + Google Books)"
              className="pl-9"
            />
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "搜索"}
          </Button>
        </form>

        {/* Results */}
        {loading ? (
          <div className="py-24 text-center">
            <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-[var(--primary)]" />
            <p className="text-sm text-[var(--muted-foreground)]">搜索中...</p>
          </div>
        ) : searched && results.length === 0 ? (
          <div className="py-24 text-center">
            <BookOpen className="mx-auto mb-4 h-12 w-12 text-[var(--muted-foreground)]" />
            <h2 className="text-lg font-medium">未找到结果</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              尝试不同的关键词
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {results.map((book, i) => (
              <div
                key={`${book.source}-${book.sourceId || i}`}
                className="flex gap-4 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"
              >
                {/* Cover */}
                <div className="h-24 w-16 shrink-0 overflow-hidden rounded bg-[var(--accent)]">
                  {book.coverUrl ? (
                    <img
                      src={book.coverUrl}
                      alt={book.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <BookOpen className="h-6 w-6 text-[var(--muted-foreground)]" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold">{book.title}</h3>
                  <p className="text-sm text-[var(--muted-foreground)]">{book.author}</p>
                  {book.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-[var(--muted-foreground)]">
                      {book.description}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    {book.publishYear && (
                      <span className="rounded bg-[var(--accent)] px-1.5 py-0.5 text-xs">
                        {book.publishYear}
                      </span>
                    )}
                    <span className="rounded bg-[var(--accent)] px-1.5 py-0.5 text-xs">
                      {book.source === "openlibrary" ? "OpenLibrary" : "Google Books"}
                    </span>
                    {book.language && (
                      <span className="text-xs text-[var(--muted-foreground)]">{book.language}</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex shrink-0 flex-col gap-1">
                  {book.source === "openlibrary" && (
                    <a
                      href={`https://openlibrary.org${book.sourceId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-[var(--primary)] hover:underline"
                    >
                      查看 <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  <span className="text-xs text-[var(--muted-foreground)]">
                    需下载 EPUB 后导入
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Note */}
        {results.length > 0 && (
          <p className="mt-6 text-center text-xs text-[var(--muted-foreground)]">
            提示：搜索到的书籍需要下载 EPUB 文件后，通过"导入书籍"功能导入到 AIReadBook
          </p>
        )}
      </main>
    </div>
  );
}
