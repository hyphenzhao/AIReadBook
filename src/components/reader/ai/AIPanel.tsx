"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useChat } from "@ai-sdk/react";
import { Send, Sparkles, FileText, Brain, GraduationCap, StopCircle, AlertCircle } from "lucide-react";
import { useReadingStore } from "@/stores/reading-store";
import { useUserStore } from "@/stores/user-store";
import { Button } from "@/components/ui/button";
import type { ChatMode } from "@/types";

const MODES: { id: ChatMode; label: string; icon: typeof Sparkles; desc: string }[] = [
  { id: "companion", label: "伴读", icon: Sparkles, desc: "随时解答疑问" },
  { id: "summary", label: "摘要", icon: FileText, desc: "快速把握要点" },
  { id: "extraction", label: "提取", icon: Brain, desc: "结构化知识" },
  { id: "teaching", label: "教学", icon: GraduationCap, desc: "引导式教学" },
];

export function AIPanel() {
  const { aiMode, setAiMode, currentBook, currentChapter } = useReadingStore();
  const aiSettings = useUserStore((s) => s.aiSettings);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const hasApiKey = !!(aiSettings.apiKey);
  const isDev = !hasApiKey;

  const { messages, append, isLoading, stop, error } = useChat({
    api: "/api/chat",
    body: {
      bookId: currentBook?.id,
      chapterId: currentChapter?.id,
      mode: aiMode,
      apiKey: aiSettings.apiKey,
      baseUrl: aiSettings.baseUrl,
      model: aiSettings.model,
    },
    initialMessages: [
      {
        id: "welcome",
        role: "assistant",
        content: `你好！我是你的 AI 阅读助手。我已完整阅读了《${currentBook?.title || "这本书"}》，可以回答任何关于书中内容的问题。试试问我："这一章的核心观点是什么？"`,
      },
    ],
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSend() {
    if (!input.trim() || isLoading) return;
    append({ role: "user", content: input });
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex h-full flex-col bg-[var(--background)]">
      {/* Mode Switcher */}
      <div className="border-b border-[var(--border)] px-3 py-2">
        <div className="flex gap-1">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setAiMode(m.id)}
              className={`flex items-center gap-1 rounded px-2.5 py-1.5 text-xs transition-colors ${
                aiMode === m.id
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : "hover:bg-[var(--accent)] text-[var(--muted-foreground)]"
              }`}
              title={m.desc}
            >
              <m.icon className="h-3.5 w-3.5" />
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* API Key warning */}
      {isDev && (
        <div className="mx-3 mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">未配置 API Key</p>
            <p className="mt-0.5">请前往<Link href="/settings" className="underline">设置 → AI 设置</Link>配置 DeepSeek API Key</p>
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="mx-3 mt-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          {error.message || "AI 服务出错，请检查 API Key 和网络连接"}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                    : "bg-[var(--accent)] text-[var(--accent-foreground)]"
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>
            </div>
          ))}
          {isLoading && messages[messages.length - 1]?.role === "user" && (
            <div className="flex justify-start">
              <div className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm">
                <span className="inline-block animate-pulse">思考中...</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-1 border-t border-[var(--border)] px-3 py-2">
        {[
          { label: "总结本章", prompt: "请总结本章的核心内容，提供三个层次的摘要：一句话概述、段落式摘要、关键要点。" },
          { label: "提取关键点", prompt: "请提取本章的关键概念和主要论点，以结构化方式列出。" },
          { label: "生成复习题", prompt: "基于本章内容，生成3道可以帮助复习和理解的问答题，包含答案。" },
          { label: "深度分析", prompt: "请深入分析本章的论证逻辑和核心思想，并联系前后的章节内容。" },
        ].map((action) => (
          <button
            key={action.label}
            onClick={() => {
              if (!isLoading) {
                append({ role: "user", content: action.prompt });
              }
            }}
            disabled={isLoading}
            className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted-foreground)] hover:bg-[var(--accent)] disabled:opacity-50"
          >
            {action.label}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="border-t border-[var(--border)] p-3">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              aiMode === "teaching"
                ? "回答 AI 的提问..."
                : aiMode === "summary"
                  ? "请 AI 总结章节内容..."
                  : "向 AI 提问（基于全书内容）..."
            }
            rows={2}
            className="flex-1 resize-none rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
          />
          {isLoading ? (
            <Button size="icon" onClick={() => stop()} variant="destructive" className="shrink-0">
              <StopCircle className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!input.trim()}
              className="shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
