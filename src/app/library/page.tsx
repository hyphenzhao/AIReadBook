"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Search, BookOpen, MoreHorizontal, Trash2, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserMenu } from "@/components/shared/UserMenu";
import { useLibraryStore } from "@/stores/library-store";

export default function LibraryPage() {
  const { books, removeBook } = useLibraryStore();
  const [search, setSearch] = useState("");

  const filtered = books.filter(
    (b) =>
      b.title.toLowerCase().includes(search.toLowerCase()) ||
      (b.author && b.author.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 text-lg font-bold">
              <BookOpen className="h-5 w-5 text-[var(--primary)]" />
              <span>AIReadBook</span>
            </Link>
            <nav className="hidden sm:flex items-center gap-1 text-sm">
              <Link href="/search" className="rounded px-3 py-1.5 text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)] flex items-center gap-1">
                <Compass className="h-3.5 w-3.5" />发现
              </Link>
              <Link href="/mind-maps" className="rounded px-3 py-1.5 text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]">
                导图
              </Link>
              <Link href="/review" className="rounded px-3 py-1.5 text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]">
                复习
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/library/import">
              <Button size="sm" className="gap-1">
                <Plus className="h-4 w-4" />
                导入书籍
              </Button>
            </Link>
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="relative mb-8">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索书名或作者..."
            className="pl-9"
          />
        </div>

        {filtered.length === 0 ? (
          <div className="py-24 text-center">
            <BookOpen className="mx-auto mb-4 h-12 w-12 text-[var(--muted-foreground)]" />
            <h2 className="text-lg font-medium">
              {search ? "没有找到匹配的书籍" : "还没有书籍"}
            </h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              {search
                ? "尝试其他关键词"
                : "导入一本 EPUB 电子书开始你的 AI 阅读之旅"}
            </p>
            {!search && (
              <Link href="/library/import" className="mt-4 inline-block">
                <Button className="gap-1">
                  <Plus className="h-4 w-4" />
                  导入第一本书
                </Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((book) => (
              <Link
                key={book.id}
                href={`/read/${book.id}`}
                className="group relative rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 transition-shadow hover:shadow-md"
              >
                <div className="mb-3 flex aspect-[3/4] items-center justify-center rounded bg-[var(--accent)]">
                  <BookOpen className="h-12 w-12 text-[var(--muted-foreground)]" />
                </div>

                <h3 className="line-clamp-1 font-semibold">{book.title}</h3>
                {book.author && (
                  <p className="line-clamp-1 text-sm text-[var(--muted-foreground)]">
                    {book.author}
                  </p>
                )}
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  {book.totalChapters} 章
                </p>

                <button
                  className="absolute right-3 top-3 cursor-pointer rounded p-1 opacity-0 transition-opacity hover:bg-[var(--accent)] group-hover:opacity-100"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (confirm(`确定删除《${book.title}》吗？`)) {
                      removeBook(book.id);
                    }
                  }}
                  title="删除"
                >
                  <Trash2 className="h-4 w-4 text-[var(--destructive)]" />
                </button>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
