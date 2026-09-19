"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BookOpen, Brain, Lightbulb, Loader2, Network, Quote, Search, Tag, Trash2 } from "lucide-react";
import { useKnowledgeStore } from "@/stores/knowledge-store";
import { useLibraryStore } from "@/stores/library-store";
import { useReviewStore } from "@/stores/review-store";
import { useUserStore } from "@/stores/user-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { errorMessage } from "@/lib/api-client-v2";
import { apiDeleteCard, apiGetCards, apiImportCards, type KnowledgeCardView } from "@/lib/api-knowledge";

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

const DIFFICULTY_LABELS: Record<string, string> = { basic: "基础", intermediate: "进阶", advanced: "高级" };

/** Where in the reader a card's quote lives. */
const sourceHref = (bookId: string, source: NonNullable<KnowledgeCardView["source"]>) =>
  `/read/${bookId}?chapter=${source.chapterId}&from=${source.charStart}&to=${source.charEnd}`;

export default function KnowledgePage() {
  const bookId = useParams().bookId as string;
  const book = useLibraryStore((s) => s.getBook(bookId));
  const addReviewCard = useReviewStore((s) => s.addCard);
  const currentUser = useUserStore((s) => s.currentUser);

  const [cards, setCards] = useState<KnowledgeCardView[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<KnowledgeCardView | null>(null);

  const load = useCallback(async () => {
    try {
      setCards((await apiGetCards(bookId)).cards);
      setError("");
    } catch (e) {
      setError(errorMessage(e, "无法加载知识卡片"));
    }
  }, [bookId]);

  // Cards used to live only in this browser's localStorage. Move them to the
  // account once, and clear the local copy only after the server confirms.
  useEffect(() => {
    if (!currentUser) return;
    void (async () => {
      const local = useKnowledgeStore.getState().cards;
      if (local.length > 0) {
        try {
          const result = await apiImportCards(local);
          useKnowledgeStore.setState({ cards: [] });
          if (result.imported) setNotice(`已把此浏览器中保存的 ${result.imported} 张卡片迁移到你的账号，换设备也能看到了。`);
        } catch {
          // Left in localStorage; the next visit tries again.
        }
      }
      await load();
    })();
  }, [currentUser, load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (cards ?? []).filter((card) => {
      if (typeFilter && card.cardType !== typeFilter) return false;
      if (!term) return true;
      return [card.title, card.content, ...card.tags].some((text) => text.toLowerCase().includes(term));
    });
  }, [cards, search, typeFilter]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const card of cards ?? []) counts[card.cardType] = (counts[card.cardType] ?? 0) + 1;
    return counts;
  }, [cards]);

  async function remove(card: KnowledgeCardView) {
    if (!window.confirm(`删除卡片「${card.title}」？`)) return;
    try {
      await apiDeleteCard(card.id);
      setCards((list) => list?.filter((c) => c.id !== card.id) ?? null);
      setSelected(null);
    } catch (e) {
      setError(errorMessage(e, "删除失败"));
    }
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 sm:px-6">
          <Link href={`/read/${bookId}`} aria-label="返回阅读" className="flex h-10 w-10 shrink-0 items-center justify-center rounded hover:bg-[var(--accent)]">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="min-w-0 truncate text-lg font-semibold">知识卡片 — {book?.title ?? "…"}</h1>
          <div className="ml-auto flex shrink-0 gap-2">
            <Link href={`/graph?bookId=${bookId}`}>
              <Button size="sm" variant="outline" className="gap-1"><Network className="h-4 w-4" /><span className="hidden sm:inline">知识图谱</span></Button>
            </Link>
            <Link href="/review"><Button size="sm" variant="outline">间隔复习</Button></Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {notice && <p className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-800 dark:bg-green-950/30 dark:text-green-300">{notice}</p>}
        {error && <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">{error}</p>}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="flex min-h-9 items-center gap-2 rounded-lg border border-[var(--border)] px-3 text-sm">
            <Brain className="h-4 w-4 text-[var(--primary)]" />{cards?.length ?? 0} 张
          </span>
          {Object.entries(typeCounts).map(([type, count]) => {
            const info = TYPE_LABELS[type];
            return (
              <button
                key={type}
                onClick={() => setTypeFilter(typeFilter === type ? null : type)}
                aria-pressed={typeFilter === type}
                className={`flex min-h-9 items-center gap-1 rounded-lg border px-3 text-sm transition-colors ${
                  typeFilter === type ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "border-[var(--border)] hover:bg-[var(--accent)]"
                }`}
              >
                {info && <info.icon className="h-3.5 w-3.5" />}{info?.label ?? type} ({count})
              </button>
            );
          })}
        </div>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索标题、内容或标签…" className="pl-9" />
        </div>

        {cards === null && !error ? (
          <p className="flex items-center justify-center gap-2 py-24 text-sm text-[var(--muted-foreground)]"><Loader2 className="h-4 w-4 animate-spin" />加载中…</p>
        ) : filtered.length === 0 ? (
          <div className="py-24 text-center">
            <Brain className="mx-auto mb-4 h-12 w-12 text-[var(--muted-foreground)]" />
            <h2 className="text-lg font-medium">{cards?.length ? "没有匹配的卡片" : "这本书还没有知识卡片"}</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              {cards?.length ? "换个关键词，或取消类型筛选" : "阅读时在 AI 面板里点「生成知识卡片」，AI 会从当前章节提炼若干知识条目。"}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((card) => {
              const info = TYPE_LABELS[card.cardType];
              return (
                <button
                  key={card.id}
                  onClick={() => setSelected(card)}
                  className={`rounded-lg border p-4 text-left transition-shadow hover:shadow-md ${TYPE_COLORS[card.cardType] ?? ""}`}
                >
                  <span className="mb-2 flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                    {info && <info.icon className="h-4 w-4" />}{info?.label ?? card.cardType}
                    <span className="ml-auto rounded bg-[var(--accent)] px-1.5 py-0.5">{DIFFICULTY_LABELS[card.difficulty] ?? card.difficulty}</span>
                  </span>
                  <span className="mb-1 block font-semibold">{card.title}</span>
                  <span className="line-clamp-3 block text-sm text-[var(--muted-foreground)]">{card.content}</span>
                  {card.chapterLabel && <span className="mt-2 block truncate text-xs text-[var(--muted-foreground)]">出自 {card.chapterLabel}</span>}
                </button>
              );
            })}
          </div>
        )}
      </main>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        {selected && (
          <DialogContent className="max-h-[85dvh] overflow-y-auto" aria-describedby={undefined}>
            <DialogHeader>
              <p className="flex flex-wrap gap-2 text-xs">
                <span className="rounded bg-[var(--primary-soft)] px-2 py-0.5 text-[var(--primary)]">{TYPE_LABELS[selected.cardType]?.label ?? selected.cardType}</span>
                <span className="rounded bg-[var(--accent)] px-2 py-0.5">{DIFFICULTY_LABELS[selected.difficulty] ?? selected.difficulty}</span>
                {selected.chapterLabel && <span className="rounded bg-[var(--accent)] px-2 py-0.5">{selected.chapterLabel}</span>}
              </p>
              <DialogTitle className="pt-1 text-xl leading-snug">{selected.title}</DialogTitle>
            </DialogHeader>
            <p className="leading-relaxed">{selected.content}</p>

            {selected.quote && (
              <blockquote className="rounded-md border-l-2 border-[var(--primary)] bg-[var(--accent)] px-3 py-2 text-sm">
                <Quote className="mb-1 h-3.5 w-3.5 text-[var(--primary)]" />
                {selected.quote}
                {selected.source && selected.bookId && (
                  <Link href={sourceHref(selected.bookId, selected.source)} className="mt-1 block text-xs text-[var(--primary)] underline">
                    回到原文这一段 →
                  </Link>
                )}
              </blockquote>
            )}

            {selected.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selected.tags.map((tag) => <span key={tag} className="rounded bg-[var(--accent)] px-2 py-1 text-xs">{tag}</span>)}
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                size="sm"
                onClick={() => {
                  if (!currentUser || !book) return;
                  addReviewCard({
                    userId: String(currentUser.id), bookId, bookTitle: book.title,
                    sourceType: "knowledge_card", sourceId: selected.id,
                    front: selected.title, back: selected.content, tags: selected.tags,
                  });
                  setNotice(`「${selected.title}」已加入间隔复习。`);
                  setSelected(null);
                }}
              >
                加入间隔复习
              </Button>
              <Button variant="outline" size="sm" className="ml-auto gap-1 text-red-600" onClick={() => remove(selected)}>
                <Trash2 className="h-3.5 w-3.5" />删除
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
