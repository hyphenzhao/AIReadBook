/**
 * External book search — OpenLibrary + Google Books APIs.
 * Both are free and don't require API keys for basic usage.
 */

export interface ExternalBook {
  title: string;
  author: string;
  coverUrl: string | null;
  source: "openlibrary" | "google_books";
  sourceId: string;
  description: string | null;
  publishYear: number | null;
  language: string | null;
}

interface OpenLibraryDoc {
  title: string;
  author_name?: string[];
  cover_i?: number;
  key: string;
  first_publish_year?: number;
  language?: string[];
  subject?: string[];
}

interface GoogleBookItem {
  id: string;
  volumeInfo: {
    title: string;
    authors?: string[];
    imageLinks?: { thumbnail?: string };
    description?: string;
    publishedDate?: string;
    language?: string;
  };
}

export async function searchOpenLibrary(query: string): Promise<ExternalBook[]> {
  try {
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=10`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return [];
    const data = await res.json();

    return (data.docs || []).slice(0, 10).map((doc: OpenLibraryDoc) => ({
      title: doc.title,
      author: doc.author_name?.[0] || "Unknown",
      coverUrl: doc.cover_i
        ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
        : null,
      source: "openlibrary" as const,
      sourceId: doc.key,
      description: doc.subject?.slice(0, 3).join("、") || null,
      publishYear: doc.first_publish_year || null,
      language: doc.language?.[0] || null,
    }));
  } catch {
    return [];
  }
}

export async function searchGoogleBooks(query: string): Promise<ExternalBook[]> {
  try {
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=10&langRestrict=zh`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return [];
    const data = await res.json();

    return ((data.items || []) as GoogleBookItem[]).map((item) => ({
      title: item.volumeInfo.title,
      author: item.volumeInfo.authors?.[0] || "Unknown",
      coverUrl: item.volumeInfo.imageLinks?.thumbnail?.replace("http:", "https:") || null,
      source: "google_books" as const,
      sourceId: item.id,
      description: item.volumeInfo.description?.slice(0, 200) || null,
      publishYear: item.volumeInfo.publishedDate
        ? parseInt(item.volumeInfo.publishedDate.substring(0, 4))
        : null,
      language: item.volumeInfo.language || null,
    }));
  } catch {
    return [];
  }
}

export async function searchAllSources(query: string): Promise<ExternalBook[]> {
  const [openLib, google] = await Promise.all([
    searchOpenLibrary(query).catch(() => []),
    searchGoogleBooks(query).catch(() => []),
  ]);

  // Merge and deduplicate by title similarity
  const seen = new Set<string>();
  const merged: ExternalBook[] = [];

  for (const book of [...openLib, ...google]) {
    const key = `${book.title}-${book.author}`.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(book);
    }
  }

  return merged.slice(0, 15);
}
