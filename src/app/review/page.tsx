"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Brain, RotateCw, Check, ThumbsUp, ThumbsDown } from "lucide-react";
import { useReviewStore } from "@/stores/review-store";
import { describeInterval } from "@/lib/spaced-repetition/sm2";
import { Button } from "@/components/ui/button";
import { useUserStore } from "@/stores/user-store";

export default function ReviewPage() {
  const { cards, getDueCards, gradeCard } = useReviewStore();
  const userId = useUserStore((s) => s.currentUser?.id);
  const [reviewIds, setReviewIds] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (!userId) return;
    setReviewIds(getDueCards().filter((card) => card.userId === String(userId)).map((card) => card.id));
    setCurrentIndex(0);
    setCompleted(false);
  }, [getDueCards, userId]);

  const currentCard = cards.find((card) => card.id === reviewIds[currentIndex]);
  const userCards = cards.filter((card) => card.userId === String(userId ?? ""));
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const stats = {
    total: userCards.length,
    due: userCards.filter((card) => new Date(card.nextReview) <= now).length,
    reviewedToday: userCards.filter((card) => card.lastReview && new Date(card.lastReview) >= today).length,
  };

  function handleGrade(quality: number) {
    if (!currentCard) return;
    gradeCard(currentCard.id, quality);
    setIsFlipped(false);

    if (currentIndex + 1 >= reviewIds.length) {
      setCompleted(true);
    } else {
      setCurrentIndex((i) => i + 1);
    }
  }

  if (!reviewIds.length || completed || !currentCard) {
    return (
      <div className="min-h-screen bg-[var(--background)]">
        <header className="border-b border-[var(--border)]">
          <div className="mx-auto flex max-w-3xl items-center gap-4 px-6 py-4">
            <Link href="/library" className="rounded p-1 hover:bg-[var(--accent)]">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-lg font-semibold">间隔复习</h1>
          </div>
        </header>

        <main className="mx-auto max-w-3xl px-6 py-24 text-center">
          <Brain className="mx-auto mb-4 h-16 w-16 text-[var(--primary)]" />
          <h2 className="text-xl font-bold">
            {completed ? "复习完成！🎉" : "暂无待复习卡片"}
          </h2>
          <p className="mt-2 text-[var(--muted-foreground)]">
            {completed
              ? `你已复习了 ${reviewIds.length} 张卡片`
              : "使用 AI 生成复习卡片，或手动创建"}
          </p>

          {stats.total > 0 && (
            <div className="mt-8 grid grid-cols-3 gap-4">
              {[
                { label: "总卡片", value: stats.total },
                { label: "待复习", value: stats.due },
                { label: "今日已复习", value: stats.reviewedToday },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border border-[var(--border)] p-4">
                  <p className="text-2xl font-bold text-[var(--primary)]">{s.value}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          <Link href="/library" className="mt-8 inline-block">
            <Button>返回书库</Button>
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-6 py-4">
          <Link href="/library" className="rounded p-1 hover:bg-[var(--accent)]">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-semibold">间隔复习</h1>
          <span className="ml-auto text-sm text-[var(--muted-foreground)]">
            {currentIndex + 1} / {reviewIds.length}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-12">
        {/* Progress bar */}
        <div className="mb-8 h-1 w-full rounded-full bg-[var(--accent)]">
          <div
            className="h-full rounded-full bg-[var(--primary)] transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / reviewIds.length) * 100}%` }}
          />
        </div>

        {/* Card */}
        <div
          className="cursor-pointer perspective-1000 min-h-[300px]"
          onClick={() => setIsFlipped(!isFlipped)}
        >
          <div
            className={`relative w-full transform-style-3d transition-transform duration-500 ${
              isFlipped ? "rotate-y-180" : ""
            }`}
          >
            {/* Front */}
            <div
              className={`rounded-xl border-2 border-[var(--border)] bg-[var(--card)] p-8 ${
                isFlipped ? "absolute inset-0 invisible" : ""
              }`}
            >
              <div className="mb-4 flex items-center gap-2">
                <span className="rounded bg-[var(--primary)]/10 px-2 py-0.5 text-xs text-[var(--primary)]">
                  {currentCard.sourceType === "annotation" ? "批注" : currentCard.sourceType === "knowledge_card" ? "知识点" : "手动"}
                </span>
                {currentCard.tags.map((t) => (
                  <span key={t} className="rounded bg-[var(--accent)] px-2 py-0.5 text-xs">
                    {t}
                  </span>
                ))}
              </div>
              <h3 className="text-xl font-medium leading-relaxed">{currentCard.front}</h3>
              <p className="mt-4 text-xs text-[var(--muted-foreground)]">
                点击翻转查看答案
              </p>
            </div>

            {/* Back */}
            <div
              className={`rounded-xl border-2 border-[var(--primary)]/30 bg-[var(--card)] p-8 ${
                !isFlipped ? "invisible" : ""
              }`}
            >
              <p className="text-sm leading-relaxed text-[var(--muted-foreground)]">
                答案：
              </p>
              <p className="mt-2 text-lg leading-relaxed">{currentCard.back}</p>
              <p className="mt-4 text-xs text-[var(--muted-foreground)]">
                来自《{currentCard.bookTitle}》
              </p>
            </div>
          </div>
        </div>

        {/* Rating buttons */}
        {isFlipped && (
          <div className="mt-8 flex items-center justify-center gap-3">
            <button
              onClick={() => handleGrade(0)}
              className="flex flex-col items-center rounded-lg border border-red-200 px-5 py-3 text-sm text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950/30"
            >
              <ThumbsDown className="mb-1 h-5 w-5" />
              完全不会
            </button>
            <button
              onClick={() => handleGrade(2)}
              className="flex flex-col items-center rounded-lg border border-orange-200 px-5 py-3 text-sm text-orange-600 hover:bg-orange-50 dark:border-orange-800 dark:hover:bg-orange-950/30"
            >
              勉强记得
            </button>
            <button
              onClick={() => handleGrade(4)}
              className="flex flex-col items-center rounded-lg border border-green-200 px-5 py-3 text-sm text-green-600 hover:bg-green-50 dark:border-green-800 dark:hover:bg-green-950/30"
            >
              <Check className="mb-1 h-5 w-5" />
              基本正确
            </button>
            <button
              onClick={() => handleGrade(5)}
              className="flex flex-col items-center rounded-lg border border-blue-200 px-5 py-3 text-sm text-blue-600 hover:bg-blue-50 dark:border-blue-800 dark:hover:bg-blue-950/30"
            >
              <ThumbsUp className="mb-1 h-5 w-5" />
              完全掌握
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
