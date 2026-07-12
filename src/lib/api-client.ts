/**
 * Client-side API helper for AIReadBook
 */

import type { Book, Chapter } from "@/types";

export interface UploadResult {
  id: string;
  title: string;
  author: string | null;
  coverUrl: string | null;
  language: string;
  totalChapters: number;
  chapters: Array<{
    id: string;
    index: number;
    title: string;
    plainText: string;
    wordCount: number;
  }>;
  metadata: Record<string, unknown>;
  uploadedAt: string;
}

export async function uploadEpub(file: File): Promise<UploadResult> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/books", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Upload failed");
  }

  return response.json();
}

export async function sendChatMessage(params: {
  bookId: string;
  chapterId?: string;
  sessionId?: string;
  mode: string;
  message: string;
  selectedText?: string;
  history?: { role: "user" | "assistant"; content: string }[];
}): Promise<Response> {
  return fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
}

export async function searchExternalBooks(query: string): Promise<unknown[]> {
  const response = await fetch(`/api/search/external?q=${encodeURIComponent(query)}`);
  if (!response.ok) return [];
  return response.json();
}
