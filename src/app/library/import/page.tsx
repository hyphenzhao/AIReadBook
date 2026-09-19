"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Upload, BookOpen, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadEpub } from "@/lib/api-client";
import { useLibraryStore } from "@/stores/library-store";

export default function ImportPage() {
  const router = useRouter();
  const addBook = useLibraryStore((s) => s.addBook);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.endsWith(".epub")) {
        setError("请选择 EPUB 格式的电子书文件");
        return;
      }

      setFileName(file.name);
      setUploading(true);
      setError("");

      try {
        const result = await uploadEpub(file);

        // Persist first; the database ID is the only valid reader route.
        const bookId = await addBook(result);

        setUploading(false);
        setDone(true);

        // Navigate to the book after a short delay
        setTimeout(() => {
          router.push(`/read/${bookId}`);
        }, 1500);
      } catch (err) {
        setUploading(false);
        setError(err instanceof Error ? err.message : "导入失败，请重试");
      }
    },
    [router, addBook],
  );

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Header */}
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-6 py-4">
          <Link href="/library" className="rounded p-1 hover:bg-[var(--accent)]">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-semibold">导入书籍</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        {/* Error */}
        {error && (
          <div className="mb-6 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Drop zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
          }}
          className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-16 transition-colors ${
            dragOver
              ? "border-[var(--primary)] bg-[var(--primary-soft)]"
              : "border-[var(--border)]"
          } ${done ? "border-green-400 bg-green-50 dark:bg-green-950/20" : ""}`}
        >
          {done ? (
            <>
              <CheckCircle className="mb-4 h-12 w-12 text-green-500" />
              <p className="text-lg font-medium">导入成功！</p>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                {fileName} — 正在跳转到阅读页面...
              </p>
            </>
          ) : uploading ? (
            <>
              <Loader2 className="mb-4 h-12 w-12 animate-spin text-[var(--primary)]" />
              <p className="text-lg font-medium">正在解析 {fileName}</p>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                提取章节内容、生成纯文本...
              </p>
            </>
          ) : (
            <>
              <Upload className="mb-4 h-12 w-12 text-[var(--muted-foreground)]" />
              <p className="text-lg font-medium">拖拽 EPUB 文件到此处</p>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                或点击下方按钮选择文件
              </p>
              <Button
                variant="outline"
                className="mt-6 gap-2"
                onClick={() => fileInputRef.current?.click()}
              >
                <BookOpen className="h-4 w-4" />
                选择 EPUB 文件
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".epub"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                  e.target.value = "";
                }}
              />
            </>
          )}
        </div>

        <div className="mt-8 text-center text-xs text-[var(--muted-foreground)]">
          <p>支持格式：EPUB (.epub) | 文件大小限制：100MB</p>
        </div>
      </main>
    </div>
  );
}
