"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import Link from "next/link";
import {
  AlertCircle, BookOpenText, ChevronLeft, FileText, Globe, History, Loader2,
  MessageSquare, Plus, Quote, Send, Sparkles, StopCircle, Trash2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CitationMarkdown } from "@/components/ai/CitationMarkdown";
import { SourcesStrip, sourcesOf } from "@/components/ai/SourcesStrip";
import { SummaryView } from "@/components/ai/SummaryView";
import { KnowledgeActions } from "@/components/ai/KnowledgeActions";
import { useChatStore, type ChatSession } from "@/stores/chat-store";
import { useUserStore } from "@/stores/user-store";
import type { SourceRef } from "@/lib/api-client-v2";
import type { ChatMode } from "@/types";

/** What is on screen. The panel knows nothing else about books or papers. */
export interface AssistantContext {
  /** Books have chapters, a summary mode and knowledge actions; papers have pages. */
  kind?: "book" | "paper";
  /** A book id, or "paper:<id>" — the key conversations are stored under. */
  bookId: string;
  bookTitle: string;
  unitId: string | null;
  unitIndex: number | null;
  /** "第三章 鸿门宴" / "第 5 页" — shown to the reader, and used to title conversations. */
  unitLabel: string;
  /** Papers: the id and the page in view. */
  paperId?: number;
  page?: number;
}

type WebMode = "auto" | "on" | "off";

const MODES: { id: ChatMode; label: string; icon: typeof Sparkles; hint: string }[] = [
  { id: "companion", label: "伴读", icon: Sparkles, hint: "随时提问：先查本章，再查全书，必要时联网" },
  { id: "summary", label: "摘要", icon: FileText, hint: "先看本章摘要，再就本章内容追问" },
];

const WEB_MODES: Record<WebMode, { label: string; title: string; next: WebMode }> = {
  auto: { label: "联网·自动", title: "问到背景、评价，或书里找不到依据时才联网", next: "on" },
  on: { label: "联网·开", title: "每次提问都同时搜索网络", next: "off" },
  off: { label: "仅书内", title: "只依据书中原文回答", next: "auto" },
};

// useChat surfaces a failed request's raw body, which is our `{ error }` JSON.
function chatErrorText(error: Error) {
  try {
    const parsed = JSON.parse(error.message);
    if (typeof parsed?.error === "string") return parsed.error;
  } catch {}
  return error.message || "AI 服务出错，请检查 AI 设置和网络连接";
}

interface Props {
  context: AssistantContext | null;
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  /** Text the reader selected and chose to ask about. */
  pendingSelection: string | null;
  onSelectionConsumed: () => void;
  onCite: (source: SourceRef) => void;
}

export function AssistantPanel({ context, mode, onModeChange, pendingSelection, onSelectionConsumed, onCite }: Props) {
  const aiSettings = useUserStore((s) => s.aiSettings);
  const aiSettingsLoaded = useUserStore((s) => s.aiSettingsLoaded);
  const { sessions, getBookSessions, addSession, deleteSession } = useChatStore();

  const [input, setInput] = useState("");
  const [quote, setQuote] = useState<string | null>(null);
  const [web, setWeb] = useState<WebMode>("auto");
  const [view, setView] = useState<"chat" | "list">("chat");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const notConfigured = aiSettingsLoaded && !aiSettings.ready;
  const bookSessions = context ? getBookSessions(context.bookId) : [];

  // Memoized: a new object each render would make useChat re-create itself.
  const isPaper = context?.kind === "paper";
  const chatBody = useMemo(() => (
    isPaper
      // The page in view changes constantly, so it travels with each question instead.
      ? { paperId: context?.paperId, mode }
      : { bookId: context?.bookId, bookTitle: context?.bookTitle, chapterId: context?.unitId, chapterIndex: context?.unitIndex, mode }
  ), [isPaper, context?.paperId, context?.bookId, context?.bookTitle, context?.unitId, context?.unitIndex, mode]);

  // Id of an answer that stopped because it hit the Max Tokens setting.
  const [truncatedId, setTruncatedId] = useState<string | null>(null);
  const { messages, append, isLoading, stop, error, setMessages } = useChat({
    api: "/api/chat",
    body: chatBody,
    onFinish: (message, { finishReason }) => setTruncatedId(finishReason === "length" ? message.id : null),
  });

  // A conversation belongs to one mode; switching mode starts a fresh one —
  // unless the switch was made in order to reopen a saved conversation.
  const reopening = useRef(false);
  useEffect(() => {
    if (reopening.current) { reopening.current = false; return; }
    setActiveSessionId(null);
    setMessages([]);
    setView("chat");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, context?.bookId]);

  // Save the finished answer (with the sources it cited) to the server.
  useEffect(() => {
    if (!activeSessionId || isLoading) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant" || !last.content) return;
    const timer = setTimeout(() => {
      useChatStore.getState().updateSessionMessages(
        activeSessionId,
        messages.map((m) => ({
          id: m.id, role: m.role, content: m.content,
          annotations: m.annotations as unknown[] | undefined,
          createdAt: new Date().toISOString(),
        })),
      );
    }, 500);
    return () => clearTimeout(timer);
  }, [messages, activeSessionId, isLoading]);

  // "问 AI" on a selection: attach it as a quote and hand over to the reader.
  useEffect(() => {
    if (!pendingSelection) return;
    setQuote(pendingSelection);
    setView("chat");
    onSelectionConsumed();
    inputRef.current?.focus();
  }, [pendingSelection, onSelectionConsumed]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, isLoading]);

  async function ensureSession(): Promise<string | null> {
    if (activeSessionId) return activeSessionId;
    if (!context) return null;
    try {
      const id = await addSession({
        bookId: context.bookId,
        chapterId: context.unitId,
        chapterTitle: context.unitLabel,
        mode,
        title: `${context.unitLabel} · ${MODES.find((m) => m.id === mode)?.label}`,
        messages: [],
      });
      setActiveSessionId(id);
      setSessionError("");
      return id;
    } catch {
      setSessionError("无法创建对话，请检查登录状态和服务器连接");
      return null;
    }
  }

  async function ask(question: string, selection: string | null = quote) {
    const content = question.trim();
    if (!content || isLoading || !context) return;
    const sessionId = await ensureSession();
    if (!sessionId) return;
    // The quoted passage is part of the visible question, and is also sent
    // separately so retrieval can search for it verbatim.
    const shown = selection ? `> ${selection.replace(/\n+/g, " ").slice(0, 600)}\n\n${content}` : content;
    useChatStore.getState().addMessage(sessionId, "user", shown);
    void append({ role: "user", content: shown }, { body: { selection: selection ?? undefined, web, page: context.page } });
    setInput("");
    setQuote(null);
  }

  function continueSession(session: ChatSession) {
    // Conversations saved under the retired 提取/教学 modes reopen as 伴读.
    const sessionMode: ChatMode = session.mode === "summary" ? "summary" : "companion";
    if (sessionMode !== mode) {
      reopening.current = true;
      onModeChange(sessionMode);
    }
    setActiveSessionId(session.id);
    setMessages(session.messages.map((m) => ({
      id: m.id, role: m.role as "user" | "assistant", content: m.content,
      annotations: m.annotations as any,
    })));
    setView("chat");
  }

  function newConversation() {
    setActiveSessionId(null);
    setMessages([]);
    setView("chat");
  }

  if (view === "list") {
    return (
      <div className="flex h-full flex-col bg-[var(--background)]">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-2 py-1.5">
          <button onClick={() => setView("chat")} className="flex min-h-9 items-center gap-1 rounded px-2 text-sm hover:bg-[var(--accent)]">
            <ChevronLeft className="h-4 w-4" />对话记录
          </button>
          <button onClick={newConversation} className="flex min-h-9 items-center gap-1 rounded px-2 text-xs text-[var(--primary)] hover:bg-[var(--accent)]">
            <Plus className="h-3.5 w-3.5" />新对话
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {bookSessions.length === 0 ? (
            <div className="py-12 text-center text-sm text-[var(--muted-foreground)]">
              <MessageSquare className="mx-auto mb-2 h-8 w-8 opacity-50" />
              <p>暂无对话记录</p>
            </div>
          ) : (
            <ul className="space-y-1">
              {bookSessions.map((s) => (
                <li key={s.id} className="flex items-center gap-1 rounded-lg hover:bg-[var(--accent)]">
                  <button onClick={() => continueSession(s)} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 p-2 text-left">
                    <MessageSquare className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{s.title}</span>
                      <span className="block text-xs text-[var(--muted-foreground)]">
                        {s.messages.length} 条消息 · {new Date(s.updatedAt).toLocaleDateString("zh-CN")}
                      </span>
                    </span>
                  </button>
                  <button
                    aria-label="删除对话"
                    onClick={() => {
                      if (!window.confirm("删除此对话？")) return;
                      if (s.id === activeSessionId) newConversation();
                      void deleteSession(s.id);
                    }}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-red-400 hover:bg-[var(--background)]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  const webMode = WEB_MODES[web];
  const emptyHint = isPaper
    ? "选中文献里的一句话，或直接提问。我会先看你正在读的这几页，再查全文；证据不够，或你问到「其他文献怎么说」时，会到你的整个文献库里找，必要时再联网。"
    : mode === "summary"
      ? "看完摘要后，可以在下面就本章内容提问。"
      : `读到不明白的地方，直接问我。我会先在「${context?.unitLabel ?? "本章"}」里找依据，不够再查全书，需要背景或评价时再联网。`;

  return (
    <div className="flex h-full flex-col bg-[var(--background)]">
      <div className="flex items-center gap-1 border-b border-[var(--border)] px-2 py-1.5">
        {isPaper && <span className="flex min-h-9 items-center gap-1.5 px-2 text-sm font-medium"><Sparkles className="h-4 w-4 text-[var(--primary)]" />问 AI</span>}
        {/* Summary mode and the knowledge actions below are built on chapters. */}
        {!isPaper && MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => onModeChange(m.id)}
            title={m.hint}
            aria-pressed={mode === m.id}
            className={`flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm transition-colors ${
              mode === m.id
                ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                : "text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
            }`}
          >
            <m.icon className="h-4 w-4" />{m.label}
          </button>
        ))}
        <button onClick={newConversation} title="新对话" aria-label="新对话" className="ml-auto flex h-9 w-9 items-center justify-center rounded text-[var(--muted-foreground)] hover:bg-[var(--accent)]">
          <Plus className="h-4 w-4" />
        </button>
        <button onClick={() => setView("list")} title="对话记录" aria-label="对话记录" className="flex h-9 w-9 items-center justify-center rounded text-[var(--muted-foreground)] hover:bg-[var(--accent)]">
          <History className="h-4 w-4" />
        </button>
      </div>

      {notConfigured && (
        <div className="mx-3 mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>尚未配置 AI。请前往<Link href="/settings?tab=ai" className="underline">设置 → AI 设置</Link>填写 API Key。</p>
        </div>
      )}
      {(error || sessionError) && (
        <div role="alert" className="mx-3 mt-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          {error ? chatErrorText(error) : sessionError}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {mode === "summary" && context?.unitId && (
          <SummaryView
            chapterId={context.unitId}
            chapterLabel={context.unitLabel}
            onCite={onCite}
            onAskAbout={(point) => void ask(`关于这一点我有疑问，请结合原文解释：${point}`, null)}
          />
        )}

        <div className="space-y-4 px-3 py-4">
          {messages.length === 0 && (
            <p className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm text-[var(--muted-foreground)]">{emptyHint}</p>
          )}
          {messages.map((msg) => {
            const sourceData = msg.role === "assistant" ? sourcesOf(msg.annotations) : null;
            return (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[92%] rounded-lg px-3 py-2 text-sm ${
                  msg.role === "user"
                    ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                    : "bg-[var(--accent)] text-[var(--accent-foreground)]"
                }`}>
                  {msg.role === "assistant" ? (
                    <>
                      {sourceData && <SourcesStrip data={sourceData} currentChapterId={context?.unitId ?? null} currentPaperId={context?.paperId} onCite={onCite} />}
                      <CitationMarkdown content={msg.content} sources={sourceData?.sources} onCite={onCite} currentPaperId={context?.paperId} />
                      {msg.id === truncatedId && (
                        <p className="mt-2 border-t border-[var(--border)] pt-2 text-xs text-amber-600">
                          回答达到了长度上限，被截断了。可以让我「继续」，或在
                          <Link href="/settings?tab=ai" className="underline">AI 设置</Link>里调大 Max Tokens。
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                  )}
                </div>
              </div>
            );
          })}
          {isLoading && messages[messages.length - 1]?.role === "user" && (
            <p className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {isPaper ? "正在查找依据：当前页 → 全文 → 文献库…" : mode === "summary" ? "正在查阅本章…" : "正在查找依据：本章 → 全书 → 网络…"}
            </p>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-[var(--border)] p-2">
        {context && !isPaper && (
          <div className="mb-2">
            <KnowledgeActions bookId={context.bookId} chapterId={context.unitId} />
          </div>
        )}
        <div className="mb-1.5 flex items-center gap-2 text-[11px] text-[var(--muted-foreground)]">
          <BookOpenText className="h-3 w-3 shrink-0" />
          <span className="min-w-0 truncate">{context?.unitLabel ?? "未选择章节"}</span>
          {mode === "companion" && (
            <button
              type="button"
              onClick={() => setWeb(webMode.next)}
              title={webMode.title}
              className={`ml-auto flex min-h-7 shrink-0 items-center gap-1 rounded-full border px-2 ${
                web === "off" ? "border-[var(--border)]" : "border-[var(--primary)]/40 text-[var(--primary)]"
              }`}
            >
              <Globe className="h-3 w-3" />{webMode.label}
            </button>
          )}
        </div>

        {quote && (
          <div className="mb-1.5 flex items-start gap-1.5 rounded-md border-l-2 border-[var(--primary)] bg-[var(--accent)] px-2 py-1.5 text-xs">
            <Quote className="mt-0.5 h-3 w-3 shrink-0 text-[var(--primary)]" />
            <span className="line-clamp-3 min-w-0 flex-1">{quote}</span>
            <button aria-label="移除引用" onClick={() => setQuote(null)} className="-m-1 flex h-7 w-7 shrink-0 items-center justify-center rounded hover:bg-[var(--background)]">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {quote && !input && (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {["这段话是什么意思？", "这段话在全书中有什么作用？", "有哪些背景知识能帮助理解这段？"].map((question) => (
              <button key={question} onClick={() => void ask(question)} className="min-h-8 rounded-full border border-[var(--border)] px-2.5 text-xs hover:bg-[var(--accent)]">
                {question}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void ask(input);
              }
            }}
            placeholder={quote ? "就这段话提问…" : mode === "summary" ? "就本章内容提问…" : "读到哪里不明白？问我…"}
            rows={2}
            className="min-h-11 flex-1 resize-none rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
          />
          {isLoading ? (
            <Button size="icon" onClick={() => stop()} variant="destructive" aria-label="停止" className="h-11 w-11 shrink-0">
              <StopCircle className="h-4 w-4" />
            </Button>
          ) : (
            <Button size="icon" onClick={() => void ask(input)} disabled={!input.trim() || !context} aria-label="发送" className="h-11 w-11 shrink-0">
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
