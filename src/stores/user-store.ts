import { create } from "zustand";
import { persist } from "zustand/middleware";
import * as api from "@/lib/api-client-v2";
import type { AISettingsPatch, AISettingsView } from "@/lib/api-client-v2";

export type AISettings = AISettingsView;
export interface UserPreferences { fontSize: number; lineHeight: number; fontFamily: string; theme: "light" | "dark" | "sepia"; language: "zh" | "en"; }
export interface UserProfile { id: number; displayName: string; email: string; avatarUrl: string | null; role: api.UserRole; }

interface UserState {
  isLoggedIn: boolean;
  currentUser: UserProfile | null;
  aiSettings: AISettings;
  /** False until the server copy of aiSettings has arrived. */
  aiSettingsLoaded: boolean;
  preferences: UserPreferences;
  sessionReady: boolean;
  /** Set when the session could not be checked because the server was unreachable. */
  sessionCheckFailed: boolean;

  login: (profile: UserProfile) => Promise<void>;
  setProfile: (profile: Partial<UserProfile>) => void;
  restoreSession: () => Promise<void>;
  logout: () => Promise<void>;
  loadSettings: (userId: number) => Promise<void>;
  saveAISettings: (patch: AISettingsPatch) => Promise<AISettings>;
  updatePreferences: (prefs: Partial<UserPreferences>) => void;
}

const defaultAISettings: AISettings = {
  ready: false, hasKey: false, keyHint: "", serverKeyAvailable: false,
  baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash", temperature: 0.7, maxTokens: 2048,
};
const defaultPreferences: UserPreferences = { fontSize: 16, lineHeight: 1.6, fontFamily: "system", theme: "light", language: "zh" };

const RETRY_DELAYS_MS = [1000, 3000, 8000];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const useUserStore = create<UserState>()(persist((set, get) => ({
  isLoggedIn: false, currentUser: null,
  sessionReady: false, sessionCheckFailed: false,
  aiSettings: { ...defaultAISettings }, aiSettingsLoaded: false,
  preferences: { ...defaultPreferences },

  login: async (profile) => {
    set({ isLoggedIn: true, currentUser: profile, sessionReady: true, sessionCheckFailed: false });
    await get().loadSettings(profile.id);
  },

  setProfile: (profile) => set((s) => (s.currentUser ? { currentUser: { ...s.currentUser, ...profile } } : {})),

  restoreSession: async () => {
    // Only a 401 means "not logged in". A 5xx or a network failure says
    // nothing about the session, so keep retrying instead of logging out.
    for (let attempt = 0; ; attempt++) {
      try {
        const { user } = await api.apiGetSession();
        const profile = {
          id: user.id,
          displayName: user.name || user.email.split("@")[0],
          email: user.email,
          avatarUrl: null,
          role: user.role === "ADMIN" ? "ADMIN" as const : "USER" as const,
        };
        set({ isLoggedIn: true, currentUser: profile, sessionReady: true, sessionCheckFailed: false });
        await get().loadSettings(profile.id);
        return;
      } catch (error) {
        if (error instanceof api.ApiError && error.isAuth) {
          set({ isLoggedIn: false, currentUser: null, sessionReady: true, sessionCheckFailed: false });
          return;
        }
        if (attempt >= RETRY_DELAYS_MS.length) {
          set({ sessionReady: true, sessionCheckFailed: true });
          return;
        }
        await sleep(RETRY_DELAYS_MS[attempt]);
      }
    }
  },

  logout: async () => {
    try { await api.apiLogout(); } catch {}
    const [{ useLibraryStore }, { useAnnotationStore }, { useChatStore }] = await Promise.all([
      import("@/stores/library-store"),
      import("@/stores/annotation-store"),
      import("@/stores/chat-store"),
    ]);
    // Knowledge cards, mind maps and review progress are deliberately left
    // alone: localStorage is still their only copy, so clearing them here
    // would destroy data. They move to the server with the knowledge rework.
    useLibraryStore.setState({ books: [], ready: false });
    useAnnotationStore.setState({ annotations: [], ready: false });
    useChatStore.setState({ sessions: [], ready: false });
    set({
      isLoggedIn: false, currentUser: null, sessionReady: true,
      aiSettings: { ...defaultAISettings }, aiSettingsLoaded: false,
    });
  },

  loadSettings: async (userId) => {
    api.setUserId(userId);
    try {
      const data = await api.apiGetUserSettings();
      set({ aiSettings: data.aiSettings, aiSettingsLoaded: true });
    } catch {
      // Leave aiSettingsLoaded false so the settings form does not present
      // defaults as if they were the saved values.
    }
  },

  saveAISettings: async (patch) => {
    const data = await api.apiSaveUserSettings(patch);
    set({ aiSettings: data.aiSettings, aiSettingsLoaded: true });
    return data.aiSettings;
  },

  updatePreferences: (prefs) => set(s => ({ preferences: { ...s.preferences, ...prefs } })),
}), {
  name: "aireadbook-user",
  partialize: (state) => ({ preferences: state.preferences }),
}));
