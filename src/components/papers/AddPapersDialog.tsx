"use client";

import { useRef, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { errorMessage } from "@/lib/api-client-v2";
import { apiImportPapers, type ImportResult } from "@/lib/api-papers";

/** Adds papers without a PDF in hand: by DOI or arXiv id, or a whole BibTeX file. */
export function AddPapersDialog({ open, onOpenChange, onAdded }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => void;
}) {
  const [identifier, setIdentifier] = useState("");
  const [bibtex, setBibtex] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function run(data: { identifier: string } | { bibtex: string }) {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const outcome = await apiImportPapers(data);
      setResult(outcome);
      if (outcome.created) { setIdentifier(""); setBibtex(""); onAdded(); }
    } catch (e) {
      setError(errorMessage(e, "添加失败"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>添加文献</DialogTitle></DialogHeader>

        <form className="space-y-1.5" onSubmit={(event) => { event.preventDefault(); if (identifier.trim()) void run({ identifier }); }}>
          <label htmlFor="add-identifier" className="block text-sm font-medium">DOI 或 arXiv 编号</label>
          <div className="flex gap-2">
            <Input id="add-identifier" value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="10.1038/ncomms15404 或 1706.03762，也可以粘贴链接" className="h-10 flex-1" />
            <Button type="submit" disabled={busy || !identifier.trim()} className="h-10 shrink-0">添加</Button>
          </div>
          <p className="text-xs text-[var(--muted-foreground)]">自动从 Crossref / arXiv 取回标题、作者、期刊和摘要。arXiv 论文会连 PDF 一起下载并处理。</p>
        </form>

        <div className="space-y-1.5 border-t border-[var(--border)] pt-4">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="add-bibtex" className="text-sm font-medium">BibTeX</label>
            <button type="button" onClick={() => fileInput.current?.click()} className="flex min-h-8 items-center gap-1 rounded px-2 text-xs text-[var(--primary)] hover:bg-[var(--accent)]">
              <FileUp className="h-3.5 w-3.5" />选择 .bib 文件
            </button>
            <input
              ref={fileInput} type="file" accept=".bib,.bibtex,text/plain" hidden
              onChange={async (event) => { const file = event.target.files?.[0]; if (file) setBibtex(await file.text()); event.target.value = ""; }}
            />
          </div>
          <textarea
            id="add-bibtex" rows={6} value={bibtex} onChange={(event) => setBibtex(event.target.value)}
            placeholder={"@article{key,\n  title = {…},\n  author = {…},\n  year = {2024}\n}"}
            className="w-full rounded-md border border-[var(--border)] bg-transparent px-2 py-1.5 font-mono text-xs"
          />
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" disabled={busy || !bibtex.trim()} onClick={() => run({ bibtex })}>导入这些条目</Button>
            <p className="text-xs text-[var(--muted-foreground)]">条目先以「待补 PDF」入库；之后上传的 PDF 会按 DOI 或标题自动挂接上去。</p>
          </div>
        </div>

        {busy && <p className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]"><Loader2 className="h-4 w-4 animate-spin" />处理中…</p>}
        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        {result && (
          <div role="status" className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm">
            <p>新增 {result.created} 篇{result.skipped ? `，${result.skipped} 篇库里已有` : ""}。</p>
            {result.note && <p className="mt-1 text-amber-600">{result.note}</p>}
            {result.skippedTitles.length > 0 && <p className="mt-1 line-clamp-3 text-xs text-[var(--muted-foreground)]">已有：{result.skippedTitles.join("；")}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
