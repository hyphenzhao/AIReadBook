"use client";

import { useEffect, useState } from "react";
import { Highlighter, Info, List, Save, Sparkles, Star, Trash2 } from "lucide-react";
import { PaperInsights } from "@/components/papers/PaperInsights";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api-client-v2";
import {
  apiGetPaperRelations, apiUpdatePaper, STAGE_LABELS, STATUS_LABELS,
  type PaperAnnotationView, type PaperCollectionView, type PaperStatus, type PaperView,
} from "@/lib/api-papers";

type Tab = "insights" | "outline" | "notes" | "info";

interface Props {
  paper: PaperView;
  outline: { title: string; page: number }[];
  annotations: PaperAnnotationView[];
  initialTab?: Tab;
  onGoToPage: (page: number) => void;
  onShowAnnotation: (annotation: PaperAnnotationView) => void;
  onDeleteAnnotation: (annotation: PaperAnnotationView) => void;
  onPaperChange: (paper: PaperView) => void;
}

/** Outline, highlights, and the paper's bibliographic record with reading status and tags. */
export function PaperSidePanel({ paper, outline, annotations, initialTab = "outline", onGoToPage, onShowAnnotation, onDeleteAnnotation, onPaperChange }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const tabs: { id: Tab; label: string; icon: typeof List }[] = [
    { id: "insights", label: "精读", icon: Sparkles },
    { id: "outline", label: "大纲", icon: List },
    { id: "notes", label: `批注${annotations.length ? ` ${annotations.length}` : ""}`, icon: Highlighter },
    { id: "info", label: "信息", icon: Info },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 border-b border-[var(--border)]">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
            className={`flex min-h-11 flex-1 items-center justify-center gap-1 text-sm ${
              tab === t.id ? "border-b-2 border-[var(--primary)] font-medium text-[var(--primary)]" : "text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
            }`}
          >
            <t.icon className="h-4 w-4" />{t.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "insights" && <PaperInsights paper={paper} onGoToPage={onGoToPage} />}

        {tab === "outline" && (
          outline.length ? (
            <ul className="p-1.5">
              {outline.map((item, i) => (
                <li key={`${item.title}-${i}`}>
                  <button onClick={() => onGoToPage(item.page)} className="flex min-h-10 w-full items-center gap-2 rounded px-2 text-left text-sm hover:bg-[var(--accent)]">
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    <span className="shrink-0 text-xs tabular-nums text-[var(--muted-foreground)]">{item.page}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-4 text-sm text-[var(--muted-foreground)]">
              {paper.processing ? `正在处理（${STAGE_LABELS[paper.stage] ?? paper.stage}）…处理完会在这里列出章节。现在就可以开始阅读。` : "没有识别出章节标题。"}
            </p>
          )
        )}

        {tab === "notes" && (
          annotations.length ? (
            <ul className="space-y-1.5 p-2">
              {annotations.map((annotation) => (
                <li key={annotation.id} className="rounded-md border border-[var(--border)]">
                  <button onClick={() => onShowAnnotation(annotation)} className="block w-full p-2 text-left text-sm hover:bg-[var(--accent)]">
                    <span className="mb-1 block text-xs text-[var(--muted-foreground)]">第 {annotation.page} 页</span>
                    <span className="line-clamp-3 border-l-2 pl-2" style={{ borderColor: annotation.color === "yellow" ? "#eab308" : annotation.color }}>{annotation.text}</span>
                    {annotation.note && <span className="mt-1 block text-[var(--muted-foreground)]">{annotation.note}</span>}
                  </button>
                  <button onClick={() => onDeleteAnnotation(annotation)} aria-label="删除批注" className="flex h-9 w-full items-center justify-center gap-1 border-t border-[var(--border)] text-xs text-red-500 hover:bg-[var(--accent)]">
                    <Trash2 className="h-3.5 w-3.5" />删除
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-4 text-sm text-[var(--muted-foreground)]">在 PDF 里选中文字，就可以划线、写批注，或者直接问 AI。</p>
          )
        )}

        {tab === "info" && <PaperInfoForm paper={paper} onPaperChange={onPaperChange} />}
      </div>
    </div>
  );
}

function PaperInfoForm({ paper, onPaperChange }: { paper: PaperView; onPaperChange: (paper: PaperView) => void }) {
  const [title, setTitle] = useState(paper.title);
  const [authors, setAuthors] = useState(paper.authors.join("; "));
  const [year, setYear] = useState(paper.year ? String(paper.year) : "");
  const [venue, setVenue] = useState(paper.venue ?? "");
  const [doi, setDoi] = useState(paper.doi ?? "");
  const [tags, setTags] = useState(paper.tags.map((t) => t.name).join(", "));
  const [notes, setNotes] = useState(paper.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [collections, setCollections] = useState<PaperCollectionView[]>([]);
  useEffect(() => { apiGetPaperRelations().then((data) => setCollections(data.collections.map((c) => ({ ...c, parentId: null, count: 0 })))).catch(() => {}); }, []);

  // The pipeline fills in the title and authors a few seconds after upload;
  // show them, unless the reader has started editing.
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (dirty) return;
    setTitle(paper.title); setAuthors(paper.authors.join("; ")); setYear(paper.year ? String(paper.year) : "");
    setVenue(paper.venue ?? ""); setDoi(paper.doi ?? "");
  }, [paper, dirty]);
  const edit = <T,>(setter: (value: T) => void) => (value: T) => { setDirty(true); setter(value); };

  async function patch(data: Parameters<typeof apiUpdatePaper>[1], quiet = false) {
    setBusy(true);
    try {
      const { paper: updated } = await apiUpdatePaper(paper.id, data);
      onPaperChange(updated);
      if (!quiet) { setMessage({ ok: true, text: "已保存" }); setDirty(false); }
    } catch (error) {
      setMessage({ ok: false, text: errorMessage(error, "保存失败") });
    } finally {
      setBusy(false);
    }
  }

  const label = "mb-1 block text-xs text-[var(--muted-foreground)]";
  return (
    <div className="space-y-3 p-3 text-sm">
      <div>
        <span className={label}>阅读状态</span>
        <div className="flex gap-1.5">
          {(Object.keys(STATUS_LABELS) as PaperStatus[]).map((status) => (
            <button
              key={status}
              disabled={busy}
              onClick={() => patch({ status }, true)}
              aria-pressed={paper.status === status}
              className={`min-h-9 flex-1 rounded-md border text-sm ${paper.status === status ? "border-[var(--primary)] bg-[var(--primary)]/10 font-medium" : "border-[var(--border)] hover:bg-[var(--accent)]"}`}
            >
              {STATUS_LABELS[status]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className={label}>评分</span>
        <div className="flex">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} disabled={busy} onClick={() => patch({ rating: paper.rating === n ? null : n }, true)} aria-label={`${n} 星`} className="flex h-10 w-10 items-center justify-center">
              <Star className={`h-5 w-5 ${paper.rating && n <= paper.rating ? "fill-amber-400 text-amber-400" : "text-[var(--muted-foreground)]"}`} />
            </button>
          ))}
        </div>
      </div>

      {collections.length > 0 && (
        <div>
          <span className={label}>所属集合</span>
          <div className="flex flex-wrap gap-1.5">
            {collections.map((collection) => {
              const member = paper.collectionIds.includes(collection.id);
              return (
                <button
                  key={collection.id}
                  disabled={busy}
                  aria-pressed={member}
                  onClick={() => patch({ collectionIds: member ? paper.collectionIds.filter((id) => id !== collection.id) : [...paper.collectionIds, collection.id] }, true)}
                  className={`min-h-8 rounded-full border px-3 text-xs ${member ? "border-[var(--primary)] bg-[var(--primary)]/10" : "border-[var(--border)] hover:bg-[var(--accent)]"}`}
                >
                  {collection.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div><label htmlFor="pi-title" className={label}>标题</label><textarea id="pi-title" rows={3} value={title} onChange={(e) => edit(setTitle)(e.target.value)} className="w-full rounded-md border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm" /></div>
      <div><label htmlFor="pi-authors" className={label}>作者（用分号分隔）</label><Input id="pi-authors" value={authors} onChange={(e) => edit(setAuthors)(e.target.value)} /></div>
      <div className="grid grid-cols-3 gap-2">
        <div><label htmlFor="pi-year" className={label}>年份</label><Input id="pi-year" inputMode="numeric" value={year} onChange={(e) => edit(setYear)(e.target.value)} /></div>
        <div className="col-span-2"><label htmlFor="pi-venue" className={label}>期刊 / 会议</label><Input id="pi-venue" value={venue} onChange={(e) => edit(setVenue)(e.target.value)} /></div>
      </div>
      <div><label htmlFor="pi-doi" className={label}>DOI</label><Input id="pi-doi" value={doi} onChange={(e) => edit(setDoi)(e.target.value)} /></div>
      <div><label htmlFor="pi-tags" className={label}>标签（用逗号分隔）</label><Input id="pi-tags" value={tags} onChange={(e) => edit(setTags)(e.target.value)} placeholder="例如：睡眠, 记忆巩固, EEG" /></div>
      <div><label htmlFor="pi-notes" className={label}>我的笔记</label><textarea id="pi-notes" rows={4} value={notes} onChange={(e) => edit(setNotes)(e.target.value)} className="w-full rounded-md border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm" /></div>

      <div className="flex items-center gap-2">
        <Button
          size="sm" disabled={busy} className="gap-1"
          onClick={() => patch({
            title, year: Number(year) || null, venue, doi, notes,
            authors: authors.split(/[;；]/).map((name) => name.trim()).filter(Boolean),
            tags: tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean),
          })}
        >
          <Save className="h-4 w-4" />保存
        </Button>
        {message && <span role="status" className={`text-xs ${message.ok ? "text-green-600" : "text-red-500"}`}>{message.text}</span>}
      </div>

      {paper.abstract && (
        <div>
          <span className={label}>摘要</span>
          <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">{paper.abstract}</p>
        </div>
      )}
      <p className="text-xs text-[var(--muted-foreground)]">
        {[paper.fileName, paper.pageCount ? `${paper.pageCount} 页` : "", STAGE_LABELS[paper.stage] ?? paper.stage].filter(Boolean).join(" · ")}
        {paper.stageError ? ` — ${paper.stageError}` : ""}
      </p>
    </div>
  );
}
