"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { useUserStore } from "@/stores/user-store";
import { useLibraryStore } from "@/stores/library-store";
import { useAnnotationStore } from "@/stores/annotation-store";
import { setSessionExpiredHandler } from "@/lib/api-client-v2";

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

  const userId = useUserStore((s) => s.currentUser?.id);

  useEffect(() => {
    // The session ran out while the app was open: drop local state and send
    // the user back through login, returning them to where they were.
    setSessionExpiredHandler(() => {
      if (!useUserStore.getState().isLoggedIn) return;
      useUserStore.setState({ isLoggedIn: false, currentUser: null });
      const next = window.location.pathname + window.location.search;
      window.location.assign(`/login?reason=expired&next=${encodeURIComponent(next)}`);
    });
    useUserStore.getState().restoreSession();
    return () => setSessionExpiredHandler(null);
  }, []);

  // Runs after restoreSession and after a fresh login alike, so the login
  // page does not have to load data before it can redirect.
  useEffect(() => {
    if (!userId) return;
    useLibraryStore.getState().load(userId);
    useAnnotationStore.getState().load(userId);
  }, [userId]);

  useEffect(() => {
    document.documentElement.classList.remove("light", "dark", "sepia");
    document.documentElement.classList.add(theme);
  }, [theme]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
