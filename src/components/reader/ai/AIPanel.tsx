"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useChat } from "@ai-sdk/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Send, Sparkles, FileText, Brain, GraduationCap, StopCircle, AlertCircle,
  Loader2, Plus, MessageSquare, Trash2, ChevronLeft, Layers,
} from "lucide-react";
import { useReadingStore } from "@/stores/reading-store";
import { useUserStore } from "@/stores/user-store";
import { useKnowledgeStore } from "@/stores/knowledge-store";
import { useChatStore, type ChatSession } from "@/stores/chat-store";
import { Button } from "@/components/ui/button";
import type { ChatMode } from "@/types";

const MODES: { id: ChatMode; label: string; icon: typeof Sparkles; desc: string }[] = [
  { id: "companion", label: "伴读", icon: Sparkles, desc: "随时解答疑问" },
  { id: "summary", label: "摘要", icon: FileText, desc: "快速把握要点" },
  { id: "extraction", label: "提取", icon: Brain, desc: "结构化知识" },
  { id: "teaching", label: "教学", icon: GraduationCap, desc: "引导式教学" },
];

const THINKING_PHASES = [
  { text: "分析问题...", color: "text-blue-500" },
  { text: "检索相关内容...", color: "text-purple-500" },
  { text: "组织回答...", color: "text-green-500" },
];

export function AIPanel() {
  const { aiMode, setAiMode, currentBook, currentChapter, pendingAskAI, clearAskAI } =
    useReadingStore();
  const aiSettings = useUserStore((s) => s.aiSettings);
  const addCards = useKnowledgeStore((s) => s.addCards);
  const addMindMap = useKnowledgeStore((s) => s.addMindMap);
  const { sessions, getBookSessions, addSession, addMessage, deleteSession } = useChatStore();

  const [input, setInput] = useState("");
  const [view, setView] = useState<"list" | "chat">("chat");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [thinkingPhase, setThinkingPhase] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const thinkingTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasApiKey = !!aiSettings.apiKey;
  const isDev = !hasApiKey;
  const bookSessions = currentBook ? getBookSessions(currentBook.id) : [];
  const activeSession = activeSessionId
    ? sessions.find((s) => s.id === activeSessionId)
    : null;

  // Memoize body to prevent infinite re-renders
  const chatBody = useMemo(() => ({
    bookId: currentBook?.id,
    bookTitle: currentBook?.title,
    chapterId: currentChapter?.id,
    mode: aiMode,
    apiKey: aiSettings.apiKey,
    baseUrl: aiSettings.baseUrl,
    model: aiSettings.model,
  }), [currentBook?.id, currentBook?.title, currentChapter?.id, aiMode, aiSettings.apiKey, aiSettings.baseUrl, aiSettings.model]);

  // --- Chat session management ---
  const { messages, append, isLoading, stop, error, setMessages } = useChat({
    api: "/api/chat",
    body: chatBody,
    initialMessages: activeSession?.messages.map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
    })) || [
      {
        id: "welcome",
        role: "assistant" as const,
        content: `你好！我是你的 AI 阅读助手。我已完整阅读了《${currentBook?.title || "这本书"}》，可以回答任何关于书中内容的问题。试试问我："这一章的核心观点是什么？"`,
      },
    ],
    onFinish: () => {
      // Stop thinking animation
      if (thinkingTimer.current) clearInterval(thinkingTimer.current);
    },
  });

  // --- Thinking phase animation ---
  useEffect(() => {
    if (isLoading) {
      setThinkingPhase(0);
      thinkingTimer.current = setInterval(() => {
        setThinkingPhase((p) => (p < THINKING_PHASES.length - 1 ? p + 1 : p));
      }, 1500);
    } else {
      if (thinkingTimer.current) clearInterval(thinkingTimer.current);
    }
    return () => {
      if (thinkingTimer.current) clearInterval(thinkingTimer.current);
    };
  }, [isLoading]);

  // --- Persist messages on change (debounced to avoid loops) ---
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!activeSessionId || messages.length <= 1) return;
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.id === "welcome") return;
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      useChatStore.getState().updateSessionMessages(
        activeSessionId,
        messages.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          createdAt: new Date().toISOString(),
        })),
      );
    }, 500);
    return () => { if (persistTimer.current) clearTimeout(persistTimer.current); };
  }, [messages, activeSessionId]);

  // --- "Ask AI" from selection ---
  useEffect(() => {
    if (pendingAskAI) {
      setView("chat");
      // Ensure we have a session
      ensureSession();
      setTimeout(() => {
        append({ role: "user", content: `请帮我分析这段话："${pendingAskAI}"` });
        clearAskAI();
      }, 200);
    }
  }, [pendingAskAI]);

  // --- Auto-scroll ---
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinkingPhase]);

  // --- Session helpers ---
  async function ensureSession() {
    if (activeSessionId) return;
    if (!currentBook) return;
    const title = `${currentChapter?.title || `第${(currentChapter?.index ?? 0) + 1}章`} · ${MODES.find((m) => m.id === aiMode)?.label || "伴读"}`;
    const id = await addSession({
      bookId: currentBook.id,
      chapterId: currentChapter?.id || null,
      chapterTitle: currentChapter?.title || null,
      mode: aiMode,
      title,
      messages: [],
    });
    setActiveSessionId(id);
  }

  async function startNewSession() {
    if (!currentBook) return;
    setMessages([]);
    const title = `${currentChapter?.title || `第${(currentChapter?.index ?? 0) + 1}章`} · ${MODES.find((m) => m.id === aiMode)?.label || "伴读"}`;
    const id = await addSession({
      bookId: currentBook.id,
      chapterId: currentChapter?.id || null,
      chapterTitle: currentChapter?.title || null,
      mode: aiMode,
      title,
      messages: [],
    });
    setActiveSessionId(id);
    setView("chat");
  }

  function continueSession(session: ChatSession) {
    setActiveSessionId(session.id);
    setMessages(
      session.messages.map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    );
    setView("chat");
  }

  function handleSend() {
    if (!input.trim() || isLoading) return;
    ensureSession();
    append({ role: "user", content: input });
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // --- Closed loop: generate knowledge cards from last AI response ---
  function handleExtractCards() {
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant || !currentBook) return;
    // Parse structured content from the assistant's reply
    const content = lastAssistant.content;
    const cardMatches = content.match(/\*\*([^*]+)\*\*[：:]\s*(.+?)(?=\n\*\*|$)/gs);
    if (cardMatches) {
      const cards = cardMatches.map((match) => {
        const [, title, body] = match.match(/\*\*(.+?)\*\*[：:]\s*(.+)/s) || [];
        return {
          bookId: currentBook.id,
          chapterId: currentChapter?.id || null,
          cardType: "concept" as const,
          title: title?.trim() || "未命名",
          content: body?.trim() || match.trim(),
          sourceChunks: [] as string[],
          tags: [] as string[],
          difficulty: "intermediate" as const,
        };
      });
      addCards(cards);
    }
  }

  function handleGenerateMindMap() {
    if (!currentBook || !currentChapter) return;
    append({
      role: "user",
      content: `请为本章内容生成一个思维导图，以树形 JSON 格式输出。根节点为章节标题，子节点为主要概念和论点，孙节点为支撑细节。输出纯 JSON，不要包含其他文本。格式：{"id":"root","label":"章节标题","children":[{"id":"1","label":"概念1","children":[...]}]}`,
    });
  }

  // --- Session list view ---
  if (view === "list") {
    return (
      <div className="flex h-full flex-col bg-[var(--background)]">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
          <h3 className="text-sm font-medium">对话记录</h3>
          <button
            onClick={startNewSession}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--primary)] hover:bg-[var(--accent)]"
          >
            <Plus className="h-3.5 w-3.5" />
            新对话
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {bookSessions.length === 0 ? (
            <div className="py-12 text-center text-sm text-[var(--muted-foreground)]">
              <MessageSquare className="mx-auto mb-2 h-8 w-8 opacity-50" />
              <p>暂无对话记录</p>
              <p className="mt-1 text-xs">开始与 AI 对话后会自动保存</p>
            </div>
          ) : (
            <div className="space-y-1">
              {bookSessions.map((s) => (
                <div
                  key={s.id}
                  onClick={() => continueSession(s)}
                  className="group flex cursor-pointer items-center gap-2 rounded-lg p-2.5 hover:bg-[var(--accent)]"
                >
                  <MessageSquare className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{s.title}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {s.messages.length} 条消息 · {new Date(s.updatedAt).toLocaleDateString("zh-CN")}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("删除此对话？")) deleteSession(s.id);
                    }}
                    className="rounded p-1 opacity-0 hover:bg-[var(--accent)] group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-400" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="border-t border-[var(--border)] p-2">
          <button
            onClick={() => setView("chat")}
            className="flex w-full items-center justify-center gap-1 rounded py-1.5 text-xs text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            返回对话
          </button>
        </div>
      </div>
    );
  }

  // --- Chat view ---
  return (
    <div className="flex h-full flex-col bg-[var(--background)]">
      {/* Mode Switcher + session nav */}
      <div className="border-b border-[var(--border)] px-3 py-2">
        <div className="flex items-center gap-1">
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
              <span className="hidden sm:inline">{m.label}</span>
            </button>
          ))}
          <button
            onClick={() => setView("list")}
            className="ml-auto rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
            title="对话记录"
          >
            <Layers className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* API Key warning */}
      {isDev && (
        <div className="mx-3 mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">未配置 API Key</p>
            <p className="mt-0.5">
              请前往<Link href="/settings" className="underline">设置 → AI 设置</Link>配置 DeepSeek API Key
            </p>
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
          {messages.map((msg, i) => {
            const isLastAssistant = msg.role === "assistant" && i === messages.length - 1;
            return (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    msg.role === "user"
                      ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                      : "bg-[var(--accent)] text-[var(--accent-foreground)]"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-[var(--foreground)] prose-p:leading-relaxed prose-li:leading-relaxed prose-code:rounded prose-code:bg-[var(--accent)] prose-code:px-1 prose-code:text-xs prose-pre:rounded-lg prose-pre:bg-[var(--accent)]">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  )}

                  {/* Closed loop buttons on last assistant message */}
                  {isLastAssistant && !isLoading && msg.content.length > 50 && (
                    <div className="mt-2 flex flex-wrap gap-1 border-t border-[var(--border)] pt-2">
                      <button
                        onClick={handleExtractCards}
                        className="rounded bg-[var(--primary)]/10 px-2 py-0.5 text-xs text-[var(--primary)] hover:bg-[var(--primary)]/20"
                      >
                        生成知识卡片
                      </button>
                      <button
                        onClick={handleGenerateMindMap}
                        className="rounded bg-[var(--primary)]/10 px-2 py-0.5 text-xs text-[var(--primary)] hover:bg-[var(--primary)]/20"
                      >
                        生成思维导图
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Thinking phases */}
          {isLoading && (
            <div className="flex flex-col gap-1">
              <div className="flex justify-start">
                <div className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {THINKING_PHASES.map((phase, i) => (
                      <span
                        key={phase.text}
                        className={`text-xs transition-all duration-500 ${
                          i <= thinkingPhase
                            ? `${phase.color} opacity-100`
                            : "text-[var(--muted-foreground)] opacity-30"
                        }`}
                      >
                        {phase.text}
                        {i < THINKING_PHASES.length - 1 && i < thinkingPhase && " ✓"}
                      </span>
                    ))}
                  </div>
                </div>
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
                ensureSession();
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
            <Button size="icon" onClick={handleSend} disabled={!input.trim()} className="shrink-0">
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
