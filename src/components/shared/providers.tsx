"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { useUserStore } from "@/stores/user-store";
import { useLibraryStore } from "@/stores/library-store";
import { useAnnotationStore } from "@/stores/annotation-store";

export function Providers({ children }: { children: ReactNode }) {
  const theme = useUserStore((s) => s.preferences.theme);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
          },
        },
      }),
  );

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      await useUserStore.getState().restoreSession();
      if (cancelled) return;
      const user = useUserStore.getState().currentUser;
      if (user) {
        await Promise.all([
          useLibraryStore.getState().load(user.id),
          useAnnotationStore.getState().load(user.id),
        ]);
      }
    }
    restore();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    document.documentElement.classList.remove("light", "dark", "sepia");
    document.documentElement.classList.add(theme);
  }, [theme]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
