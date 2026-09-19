"use client";

import { useState } from "react";
import { List, Highlighter, Brain, Trash2, Edit3, Tag } from "lucide-react";
import Link from "next/link";
import { useReadingStore } from "@/stores/reading-store";
import { useAnnotationStore } from "@/stores/annotation-store";
import { Button } from "@/components/ui/button";

type TabId = "toc" | "annotations" | "extractions";

const COLORS: Record<string, string> = {
  yellow: "bg-yellow-200 dark:bg-yellow-900/40",
  green: "bg-green-200 dark:bg-green-900/40",
  blue: "bg-blue-200 dark:bg-blue-900/40",
  pink: "bg-pink-200 dark:bg-pink-900/40",
  orange: "bg-orange-200 dark:bg-orange-900/40",
};

export function LeftPanel() {
  const [activeTab, setActiveTab] = useState<TabId>("toc");
  const { chapters, currentChapter, setChapter, currentBook } = useReadingStore();
  const { getBookAnnotations, removeAnnotation, updateAnnotation } = useAnnotationStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState("");
  const [colorFilter, setColorFilter] = useState<string | null>(null);

  const annotations = currentBook
    ? getBookAnnotations(currentBook.id)
    : [];
  const filteredAnnotations = colorFilter
    ? annotations.filter((a) => a.color === colorFilter)
    : annotations;

  const tabs: { id: TabId; label: string; icon: typeof List }[] = [
    { id: "toc", label: "目录", icon: List },
    { id: "annotations", label: `批注 (${annotations.length})`, icon: Highlighter },
    { id: "extractions", label: "知识", icon: Brain },
  ];

  return (
    <div className="flex h-full flex-col bg-[var(--background)]">
      {/* Tabs */}
      <div className="flex border-b border-[var(--border)]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex flex-1 items-center justify-center gap-1 py-2 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? "border-b-2 border-[var(--primary)] text-[var(--primary)]"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            }`}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "toc" && (
          <div className="space-y-0.5 p-2">
            {chapters.map((ch) => (
              <button
                key={ch.id}
                onClick={() => setChapter(ch)}
                className={`w-full rounded px-2 py-1.5 text-left text-sm transition-colors ${
                  ch.id === currentChapter?.id
                    ? "bg-[var(--primary-soft)] font-medium text-[var(--primary)]"
                    : "hover:bg-[var(--accent)] text-[var(--foreground)]"
                }`}
              >
                <span className="mr-2 text-xs text-[var(--muted-foreground)]">
                  {ch.index + 1}.
                </span>
                {ch.title || `第 ${ch.index + 1} 章`}
              </button>
            ))}
          </div>
        )}

        {activeTab === "annotations" && (
          <div>
            {/* Color filter */}
            {annotations.length > 0 && (
              <div className="flex gap-1 border-b border-[var(--border)] px-2 py-1.5">
                <button
                  onClick={() => setColorFilter(null)}
                  className={`rounded px-1.5 py-0.5 text-xs ${
                    !colorFilter ? "bg-[var(--accent)]" : ""
                  }`}
                >
                  全部
                </button>
                {Object.keys(COLORS).map((c) => (
                  <button
                    key={c}
                    onClick={() => setColorFilter(c)}
                    className={`h-4 w-4 rounded-full ${COLORS[c]} border ${
                      colorFilter === c ? "ring-2 ring-[var(--primary)]" : ""
                    }`}
                  />
                ))}
              </div>
            )}

            {filteredAnnotations.length === 0 ? (
              <div className="py-12 text-center text-sm text-[var(--muted-foreground)]">
                <Highlighter className="mx-auto mb-2 h-8 w-8 opacity-50" />
                <p>{annotations.length === 0 ? "暂无批注" : "无匹配批注"}</p>
                <p className="mt-1 text-xs">选中文字即可添加批注</p>
              </div>
            ) : (
              <div className="space-y-2 p-2">
                {filteredAnnotations.map((a) => (
                  <div
                    key={a.id}
                    className={`rounded border border-[var(--border)] p-2 ${COLORS[a.color]}`}
                  >
                    {/* Highlighted text */}
                    <p className="text-sm leading-relaxed">{a.selectedText}</p>

                    {/* Note */}
                    {editingId === a.id ? (
                      <div className="mt-2">
                        <textarea
                          value={editNote}
                          onChange={(e) => setEditNote(e.target.value)}
                          className="w-full rounded border border-[var(--border)] bg-white/50 px-2 py-1 text-xs dark:bg-black/20"
                          rows={3}
                          autoFocus
                        />
                        <div className="mt-1 flex gap-1">
                          <button
                            onClick={() => {
                              updateAnnotation(a.id, { note: editNote });
                              setEditingId(null);
                            }}
                            className="rounded bg-[var(--primary)] px-2 py-0.5 text-xs text-white"
                          >
                            保存
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="rounded bg-[var(--accent)] px-2 py-0.5 text-xs"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      a.note && (
                        <p className="mt-1 text-xs italic text-[var(--muted-foreground)]">
                          {a.note}
                        </p>
                      )
                    )}

                    {/* AI category */}
                    {a.aiCategory && (
                      <span className="mt-1 inline-flex items-center gap-1 rounded bg-white/50 px-1.5 py-0.5 text-xs dark:bg-black/20">
                        <Tag className="h-3 w-3" />
                        {a.aiCategory}
                      </span>
                    )}

                    {/* Actions */}
                    <div className="mt-1 flex gap-1">
                      <button
                        onClick={() => {
                          setEditingId(a.id);
                          setEditNote(a.note);
                        }}
                        className="rounded p-0.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                      >
                        <Edit3 className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => removeAnnotation(a.id)}
                        className="rounded p-0.5 text-[var(--muted-foreground)] hover:text-red-500"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "extractions" && (
          <div className="py-12 text-center text-sm text-[var(--muted-foreground)]">
            <Brain className="mx-auto mb-2 h-8 w-8 opacity-50" />
            <p>知识卡片管理</p>
            <p className="mt-1 text-xs">在 AI 面板提取后，可集中查看和加入复习</p>
            {currentBook && (
              <Link
                href={`/read/${currentBook.id}/knowledge`}
                className="mt-3 inline-block rounded bg-[var(--primary)] px-3 py-1.5 text-xs text-[var(--primary-foreground)]"
              >
                打开知识管理
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
