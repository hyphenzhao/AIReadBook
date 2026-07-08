"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Brain, Lightbulb, BookOpen, Search, Filter,
  ChevronDown, ExternalLink, Tag,
} from "lucide-react";
import { useKnowledgeStore, type KnowledgeCard } from "@/stores/knowledge-store";
import { useLibraryStore } from "@/stores/library-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const TYPE_LABELS: Record<string, { label: string; icon: typeof Brain }> = {
  concept: { label: "概念", icon: Brain },
  argument: { label: "论点", icon: Lightbulb },
  evidence: { label: "论据", icon: BookOpen },
  example: { label: "案例", icon: Tag },
  question: { label: "问题", icon: Search },
};

const TYPE_COLORS: Record<string, string> = {
  concept: "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20",
  argument: "border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-950/20",
  evidence: "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20",
  example: "border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/20",
  question: "border-pink-200 bg-pink-50 dark:border-pink-800 dark:bg-pink-950/20",
};

export default function KnowledgePage() {
  const params = useParams();
  const router = useRouter();
  const bookId = params.bookId as string;
  const book = useLibraryStore((s) => s.getBook(bookId));
  const { getBookCards } = useKnowledgeStore();
  const cards = getBookCards(bookId);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [difficultyFilter, setDifficultyFilter] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<KnowledgeCard | null>(null);

  const filtered = cards.filter((c) => {
    if (search && !c.title.includes(search) && !c.content.includes(search)) return false;
    if (typeFilter && c.cardType !== typeFilter) return false;
    if (difficultyFilter && c.difficulty !== difficultyFilter) return false;
    return true;
  });

  const typeCounts = cards.reduce(
    (acc, c) => {
      acc[c.cardType] = (acc[c.cardType] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-4">
          <Link href={`/read/${bookId}`} className="rounded p-1 hover:bg-[var(--accent)]">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-semibold">知识管理 — {book?.title || "加载中..."}</h1>
          <Link href="/review" className="ml-auto">
            <Button size="sm" variant="outline" className="gap-1">
              间隔复习
            </Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        {/* Stats bar */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm">
            <Brain className="h-4 w-4 text-[var(--primary)]" />
            <span>{cards.length} 张知识卡片</span>
          </div>
          {Object.entries(typeCounts).map(([type, count]) => {
            const info = TYPE_LABELS[type];
            return (
              <button
                key={type}
                onClick={() => setTypeFilter(typeFilter === type ? null : type)}
                className={`flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                  typeFilter === type
                    ? "border-[var(--primary)] bg-[var(--primary)]/10"
                    : "border-[var(--border)] hover:bg-[var(--accent)]"
                }`}
              >
                {info && <info.icon className="h-3.5 w-3.5" />}
                {info?.label || type} ({count})
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索知识卡片..."
            className="pl-9"
          />
        </div>

        {filtered.length === 0 ? (
          <div className="py-24 text-center">
            <Brain className="mx-auto mb-4 h-12 w-12 text-[var(--muted-foreground)]" />
            <h2 className="text-lg font-medium">
              {cards.length === 0 ? "暂无知识卡片" : "没有匹配的卡片"}
            </h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              {cards.length === 0
                ? "在阅读时使用 AI 提取关键点来生成知识卡片"
                : "尝试调整过滤条件"}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((card) => {
              const info = TYPE_LABELS[card.cardType];
              return (
                <div
                  key={card.id}
                  onClick={() => setSelectedCard(card)}
                  className={`cursor-pointer rounded-lg border p-4 transition-shadow hover:shadow-md ${TYPE_COLORS[card.cardType] || ""}`}
                >
                  <div className="mb-2 flex items-center gap-2">
                    {info && <info.icon className="h-4 w-4" />}
                    <span className="text-xs font-medium text-[var(--muted-foreground)]">
                      {info?.label || card.cardType}
                    </span>
                    {card.difficulty && (
                      <span className="ml-auto rounded bg-[var(--accent)] px-1.5 py-0.5 text-xs">
                        {card.difficulty === "basic" ? "基础" : card.difficulty === "intermediate" ? "进阶" : "高级"}
                      </span>
                    )}
                  </div>
                  <h3 className="mb-1 font-semibold">{card.title}</h3>
                  <p className="line-clamp-3 text-sm text-[var(--muted-foreground)]">
                    {card.content}
                  </p>
                  {card.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {card.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded border border-[var(--border)] px-1.5 py-0.5 text-xs"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Card detail modal */}
      {selectedCard && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSelectedCard(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--background)] p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-2">
              <span className="rounded bg-[var(--primary)]/10 px-2 py-0.5 text-xs text-[var(--primary)]">
                {TYPE_LABELS[selectedCard.cardType]?.label || selectedCard.cardType}
              </span>
              <span className="rounded bg-[var(--accent)] px-2 py-0.5 text-xs">
                {selectedCard.difficulty === "basic" ? "基础" : selectedCard.difficulty === "intermediate" ? "进阶" : "高级"}
              </span>
            </div>
            <h2 className="mb-3 text-xl font-bold">{selectedCard.title}</h2>
            <p className="leading-relaxed text-[var(--foreground)]">{selectedCard.content}</p>
            {selectedCard.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1">
                {selectedCard.tags.map((t) => (
                  <span key={t} className="rounded bg-[var(--accent)] px-2 py-1 text-xs">{t}</span>
                ))}
              </div>
            )}
            <div className="mt-6 flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setSelectedCard(null)}>
                关闭
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
