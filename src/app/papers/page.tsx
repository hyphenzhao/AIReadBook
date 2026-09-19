"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, BookOpen, Download, FileText, FolderOpen, FolderPlus, Library, Loader2, Network, Plus, Search, Star, Tag, Upload } from "lucide-react";
import { AddPapersDialog } from "@/components/papers/AddPapersDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserMenu } from "@/components/shared/UserMenu";
import { errorMessage } from "@/lib/api-client-v2";
import {
  apiCreatePaperCollection, apiListPapers, apiUploadPaper, paperExportUrl, STAGE_LABELS, STATUS_LABELS,
  type PaperFilters, type PaperLibrary, type PaperStatus, type PaperView,
} from "@/lib/api-papers";

interface UploadItem { name: string; fraction: number; error?: string; note?: string }

const STATUS_STYLE: Record<PaperStatus, string> = {
  UNREAD: "bg-[var(--accent)] text-[var(--muted-foreground)]",
  READING: "bg-blue-500/10 text-blue-600",
  READ: "bg-green-500/10 text-green-600",
};

function formatBytes(bytes: number | null) {
  if (!bytes) return "";
  return bytes > 1 << 20 ? `${(bytes / (1 << 20)).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

export default function PapersPage() {
  const [library, setLibrary] = useState<PaperLibrary | null>(null);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<PaperFilters>({});
  const [search, setSearch] = useState("");
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [adding, setAdding] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function newCollection() {
    const name = window.prompt("新集合的名称（例如一个课题、一篇正在写的论文）：")?.trim();
    if (!name) return;
    try {
      await apiCreatePaperCollection(name);
      await load();
    } catch (e) {
      setError(errorMessage(e, "无法创建集合"));
    }
  }

  const load = useCallback(async () => {
    try {
      setLibrary(await apiListPapers(filters));
      setError("");
    } catch (e) {
      setError(errorMessage(e, "无法加载文献库"));
    }
  }, [filters]);
  useEffect(() => { void load(); }, [load]);

  // Search as you type, without a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setFilters((f) => (f.q === (search.trim() || undefined) ? f : { ...f, q: search.trim() || undefined })), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // While any paper is still being processed, keep its progress chip current.
  const processing = library?.papers.some((paper) => paper.processing) ?? false;
  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, [processing, load]);

  async function uploadFiles(files: File[]) {
    const pdfs = files.filter((file) => file.type === "application/pdf" || /\.pdf$/i.test(file.name));
    const rejected = files.length - pdfs.length;
    setUploads((current) => [
      ...current,
      ...pdfs.map((file) => ({ name: file.name, fraction: 0 })),
      ...(rejected ? [{ name: `${rejected} 个文件`, fraction: 1, error: "不是 PDF，已跳过" }] : []),
    ]);
    // One at a time: uploads share the connection, and the server ingests them one by one anyway.
    for (const file of pdfs) {
      const update = (patch: Partial<UploadItem>) =>
        setUploads((current) => current.map((item) => (item.name === file.name ? { ...item, ...patch } : item)));
      try {
        const result = await apiUploadPaper(file, { onProgress: (fraction) => update({ fraction }) });
        update({ fraction: 1, note: result.duplicate ? "库里已有这篇，未重复添加" : "已上传，正在后台处理" });
        await load();
      } catch (e) {
        update({ fraction: 1, error: errorMessage(e, "上传失败") });
      }
    }
    setTimeout(() => setUploads((current) => current.filter((item) => item.error)), 6000);
  }

  const years = useMemo(
    () => [...new Set((library?.papers ?? []).map((paper) => paper.year).filter((y): y is number => !!y))].sort((a, b) => b - a),
    [library],
  );
  const filtered = Object.values(filters).some((value) => value !== undefined);

  return (
    <div
      className="min-h-dvh bg-[var(--background)]"
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }}
      onDrop={(event) => { event.preventDefault(); setDragging(false); void uploadFiles([...event.dataTransfer.files]); }}
    >
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--background)]">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 sm:px-6">
          <FileText className="h-5 w-5 shrink-0 text-[var(--primary)]" />
          <h1 className="text-lg font-semibold">文献</h1>
          <nav className="ml-2 flex items-center gap-1 text-sm">
            <Link href="/library" className="flex min-h-9 items-center gap-1 rounded px-2 text-[var(--muted-foreground)] hover:bg-[var(--accent)]">
              <Library className="h-4 w-4" /><span className="hidden sm:inline">读书</span>
            </Link>
            <Link href="/papers/graph" className="flex min-h-9 items-center gap-1 rounded px-2 text-[var(--muted-foreground)] hover:bg-[var(--accent)]">
              <Network className="h-4 w-4" /><span className="hidden sm:inline">文献图谱</span>
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {!!library?.papers.length && (
              <a href={paperExportUrl({ collectionId: filters.collectionId })} download title="导出 BibTeX" aria-label="导出 BibTeX" className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] hover:bg-[var(--accent)]">
                <Download className="h-4 w-4" />
              </a>
            )}
            <Button size="sm" variant="outline" className="gap-1" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" /><span className="hidden sm:inline">DOI / BibTeX</span>
            </Button>
            <Button size="sm" className="gap-1" onClick={() => fileInput.current?.click()}>
              <Upload className="h-4 w-4" /><span className="hidden sm:inline">上传 PDF</span>
            </Button>
            <input
              ref={fileInput} type="file" accept="application/pdf,.pdf" multiple hidden
              onChange={(event) => { void uploadFiles([...(event.target.files ?? [])]); event.target.value = ""; }}
            />
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
        {error && <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">{error}</p>}

        {uploads.length > 0 && (
          <ul className="mb-4 space-y-1.5">
            {uploads.map((item, i) => (
              <li key={`${item.name}-${i}`} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  <span className={`shrink-0 text-xs ${item.error ? "text-red-500" : "text-[var(--muted-foreground)]"}`}>
                    {item.error ?? item.note ?? `${Math.round(item.fraction * 100)}%`}
                  </span>
                </div>
                {!item.error && !item.note && (
                  <div className="mt-1.5 h-1 overflow-hidden rounded bg-[var(--accent)]">
                    <div className="h-full bg-[var(--primary)] transition-[width]" style={{ width: `${item.fraction * 100}%` }} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索标题、作者、期刊、摘要…" className="h-10 pl-9" />
          </div>
          <div className="flex gap-2 overflow-x-auto">
            <select
              aria-label="阅读状态" value={filters.status ?? ""}
              onChange={(event) => setFilters({ ...filters, status: (event.target.value || undefined) as PaperStatus | undefined })}
              className="h-10 shrink-0 rounded-md border border-[var(--border)] bg-transparent px-2 text-sm"
            >
              <option value="">全部状态</option>
              {(Object.keys(STATUS_LABELS) as PaperStatus[]).map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
            </select>
            {!!library?.collections.length && (
              <select
                aria-label="集合" value={filters.collectionId ?? ""}
                onChange={(event) => setFilters({ ...filters, collectionId: Number(event.target.value) || undefined })}
                className="h-10 shrink-0 rounded-md border border-[var(--border)] bg-transparent px-2 text-sm"
              >
                <option value="">全部集合</option>
                {library.collections.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.count})</option>)}
              </select>
            )}
            <button onClick={newCollection} className="flex h-10 shrink-0 items-center gap-1 rounded-md border border-dashed border-[var(--border)] px-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--accent)]">
              <FolderPlus className="h-4 w-4" />新集合
            </button>
            {years.length > 1 && (
              <select
                aria-label="年份" value={filters.year ?? ""}
                onChange={(event) => setFilters({ ...filters, year: Number(event.target.value) || undefined })}
                className="h-10 shrink-0 rounded-md border border-[var(--border)] bg-transparent px-2 text-sm"
              >
                <option value="">全部年份</option>
                {years.map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
            )}
          </div>
        </div>

        {!!library?.tags.length && (
          <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
            {library.tags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => setFilters({ ...filters, tagId: filters.tagId === tag.id ? undefined : tag.id })}
                aria-pressed={filters.tagId === tag.id}
                className={`flex min-h-8 shrink-0 items-center gap-1 rounded-full border px-3 text-xs ${
                  filters.tagId === tag.id ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "border-[var(--border)] hover:bg-[var(--accent)]"
                }`}
              >
                <Tag className="h-3 w-3" />{tag.name}<span className="text-[var(--muted-foreground)]">{tag.count}</span>
              </button>
            ))}
          </div>
        )}

        {library === null && !error ? (
          <p className="flex items-center justify-center gap-2 py-24 text-sm text-[var(--muted-foreground)]"><Loader2 className="h-4 w-4 animate-spin" />加载中…</p>
        ) : library && library.papers.length === 0 ? (
          <div className={`rounded-xl border-2 border-dashed px-6 py-16 text-center ${dragging ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "border-[var(--border)]"}`}>
            {filtered ? (
              <>
                <FolderOpen className="mx-auto mb-3 h-10 w-10 text-[var(--muted-foreground)]" />
                <p className="font-medium">没有符合条件的文献</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => { setFilters({}); setSearch(""); }}>清除筛选</Button>
              </>
            ) : (
              <>
                <Upload className="mx-auto mb-3 h-10 w-10 text-[var(--muted-foreground)]" />
                <p className="font-medium">把 PDF 拖到这里，或点右上角「上传 PDF」</p>
                <p className="mx-auto mt-1 max-w-md text-sm text-[var(--muted-foreground)]">
                  上传后马上就能阅读。文字提取、元数据识别和语义索引在后台只做一次，之后打开文献、问 AI、找关联，都不用再解析 PDF。
                </p>
              </>
            )}
          </div>
        ) : (
          <ul className="space-y-2">
            {library?.papers.map((paper) => <PaperRow key={paper.id} paper={paper} />)}
          </ul>
        )}
      </main>

      <AddPapersDialog open={adding} onOpenChange={setAdding} onAdded={load} />

      {dragging && !!library?.papers.length && (
        <div className="pointer-events-none fixed inset-4 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed border-[var(--primary)] bg-[var(--primary-soft)] text-lg font-medium text-[var(--primary)]">
          松手即可上传
        </div>
      )}
    </div>
  );
}

function PaperRow({ paper }: { paper: PaperView }) {
  const failed = paper.stage === "FAILED";
  return (
    <li>
      <Link
        href={paper.hasFile ? `/papers/${paper.id}` : `/papers/${paper.id}?info=1`}
        className="block rounded-lg border border-[var(--border)] p-3 transition-shadow hover:shadow-md sm:p-4"
      >
        <div className="flex items-start gap-3">
          <BookOpen className="mt-1 hidden h-5 w-5 shrink-0 text-[var(--muted-foreground)] sm:block" />
          <div className="min-w-0 flex-1">
            <h2 className="line-clamp-2 font-medium leading-snug">{paper.title}</h2>
            <p className="mt-0.5 truncate text-sm text-[var(--muted-foreground)]">
              {[paper.authors.slice(0, 3).join(", ") + (paper.authors.length > 3 ? " 等" : ""), paper.venue, paper.year].filter(Boolean).join(" · ") || "作者与出处待识别"}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
              <span className={`rounded px-1.5 py-0.5 ${STATUS_STYLE[paper.status]}`}>{STATUS_LABELS[paper.status]}</span>
              {paper.processing && (
                <span className="flex items-center gap-1 rounded bg-[var(--primary-soft)] px-1.5 py-0.5 text-[var(--primary)]">
                  <Loader2 className="h-3 w-3 animate-spin" />{STAGE_LABELS[paper.stage] ?? paper.stage}
                </span>
              )}
              {(failed || paper.stage === "NO_FILE" || paper.stage === "NEEDS_KEY") && (
                <span className={`flex items-center gap-1 rounded px-1.5 py-0.5 ${failed ? "bg-red-500/10 text-red-600" : "bg-amber-500/10 text-amber-600"}`} title={paper.stageError ?? undefined}>
                  <AlertCircle className="h-3 w-3" />{STAGE_LABELS[paper.stage]}
                </span>
              )}
              {paper.rating && <span className="flex items-center gap-0.5 text-amber-500"><Star className="h-3 w-3 fill-current" />{paper.rating}</span>}
              {paper.tags.map((tag) => <span key={tag.id} className="rounded border border-[var(--border)] px-1.5 py-0.5">{tag.name}</span>)}
              <span className="ml-auto text-[var(--muted-foreground)]">
                {[paper.pageCount ? `${paper.pageCount} 页` : "", formatBytes(paper.fileBytes)].filter(Boolean).join(" · ")}
              </span>
            </div>
          </div>
        </div>
      </Link>
    </li>
  );
}
