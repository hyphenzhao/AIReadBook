"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Network } from "lucide-react";
import { useKnowledgeStore } from "@/stores/knowledge-store";
import { useLibraryStore } from "@/stores/library-store";
import { MindMapViewer } from "@/components/mind-map/MindMapViewer";
import { Button } from "@/components/ui/button";

export default function MindMapsPage() {
  const { mindMaps, getBookMindMaps } = useKnowledgeStore();
  const books = useLibraryStore((s) => s.books);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(
    books[0]?.id ?? null,
  );

  useEffect(() => {
    if (!selectedBookId && books[0]) setSelectedBookId(books[0].id);
  }, [books, selectedBookId]);

  const bookMindMaps = selectedBookId ? getBookMindMaps(selectedBookId) : [];
  const selectedBook = books.find((b) => b.id === selectedBookId);

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-4">
          <Link href="/library" className="rounded p-1 hover:bg-[var(--accent)]">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-semibold">思维导图</h1>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        {/* Book selector */}
        {books.length > 0 && (
          <div className="mb-6 flex flex-wrap gap-2">
            {books.map((b) => (
              <button
                key={b.id}
                onClick={() => setSelectedBookId(b.id)}
                className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                  selectedBookId === b.id
                    ? "border-[var(--primary)] bg-[var(--primary)]/10"
                    : "border-[var(--border)] hover:bg-[var(--accent)]"
                }`}
              >
                {b.title}
              </button>
            ))}
          </div>
        )}

        {bookMindMaps.length === 0 ? (
          <div className="py-24 text-center">
            <Network className="mx-auto mb-4 h-12 w-12 text-[var(--muted-foreground)]" />
            <h2 className="text-lg font-medium">暂无思维导图</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              {books.length === 0
                ? "先导入一本书开始阅读"
                : "在阅读时使用 AI 生成思维导图"}
            </p>
            {selectedBook && (
              <div className="mt-4 space-y-2">
                <Link href={`/read/${selectedBook.id}`}>
                  <Button variant="outline" size="sm">
                    返回阅读
                  </Button>
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {bookMindMaps.map((mm) => (
              <MindMapViewer
                key={mm.id}
                data={mm.data}
                title={mm.title}
                onNodeClick={(node) => {
                  if (node.cardId) {
                    // Navigate or show card detail
                  }
                }}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
