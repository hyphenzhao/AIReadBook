import { create } from "zustand";
import { persist } from "zustand/middleware";
import * as api from "@/lib/api-client-v2";

export interface AISettings { apiKey: string; baseUrl: string; model: string; temperature: number; maxTokens: number; }
export interface UserPreferences { fontSize: number; lineHeight: number; fontFamily: string; theme: "light" | "dark" | "sepia"; language: "zh" | "en"; }
export interface UserProfile { id: number; displayName: string; email: string; avatarUrl: string | null; }

interface UserState {
  isLoggedIn: boolean;
  currentUser: UserProfile | null;
  aiSettings: AISettings;
  preferences: UserPreferences;
  sessionReady: boolean;

  login: (profile: UserProfile) => Promise<void>;
  restoreSession: () => Promise<void>;
  logout: () => Promise<void>;
  loadSettings: (userId: number) => Promise<void>;
  updateAISettings: (settings: Partial<AISettings>) => void;
  updatePreferences: (prefs: Partial<UserPreferences>) => void;
}

const defaultAISettings: AISettings = { apiKey: "", baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash", temperature: 0.7, maxTokens: 2048 };
const defaultPreferences: UserPreferences = { fontSize: 16, lineHeight: 1.6, fontFamily: "system", theme: "light", language: "zh" };

export const useUserStore = create<UserState>()(persist((set, get) => ({
  isLoggedIn: false, currentUser: null,
  sessionReady: false,
  aiSettings: { ...defaultAISettings }, preferences: { ...defaultPreferences },

  login: async (profile) => {
    set({ isLoggedIn: true, currentUser: profile, sessionReady: true });
    await get().loadSettings(profile.id);
  },

  restoreSession: async () => {
    try {
      const data = await api.apiGetSession();
      const user = data.user;
      if (user) {
        const profile = {
          id: user.id,
          displayName: user.name || user.email.split("@")[0],
          email: user.email,
          avatarUrl: null,
        };
        set({ isLoggedIn: true, currentUser: profile });
        await get().loadSettings(profile.id);
      }
    } catch {
      set({ isLoggedIn: false, currentUser: null });
    } finally {
      set({ sessionReady: true });
    }
  },

  logout: async () => {
    try { await api.apiLogout(); } catch {}
    const [{ useLibraryStore }, { useAnnotationStore }, { useChatStore }] = await Promise.all([
      import("@/stores/library-store"),
      import("@/stores/annotation-store"),
      import("@/stores/chat-store"),
    ]);
    useLibraryStore.setState({ books: [], ready: false });
    useAnnotationStore.setState({ annotations: [], ready: false });
    useChatStore.setState({ sessions: [], ready: false });
    set({ isLoggedIn: false, currentUser: null, aiSettings: { ...defaultAISettings }, sessionReady: true });
  },

  loadSettings: async (userId) => {
    api.setUserId(userId);
    try {
      const data = await api.apiGetUserSettings();
      if (data.aiSettings && Object.keys(data.aiSettings).length > 0) {
        set({ aiSettings: { ...defaultAISettings, ...data.aiSettings } });
      }
    } catch {}
  },

  updateAISettings: (settings) => {
    const merged = { ...get().aiSettings, ...settings };
    set({ aiSettings: merged });
    if (get().isLoggedIn) api.apiSaveUserSettings(merged).catch(() => {});
  },

  updatePreferences: (prefs) => set(s => ({ preferences: { ...s.preferences, ...prefs } })),
}), {
  name: "aireadbook-user",
  partialize: (state) => ({ preferences: state.preferences }),
}));
