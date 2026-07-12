import { create } from "zustand";
import * as api from "@/lib/api-client-v2";

export interface AISettings { apiKey: string; baseUrl: string; model: string; temperature: number; maxTokens: number; }
export interface UserPreferences { fontSize: number; lineHeight: number; fontFamily: string; theme: "light" | "dark" | "sepia"; language: "zh" | "en"; }
export interface UserProfile { id: number; displayName: string; email: string; avatarUrl: string | null; }

interface UserState {
  isLoggedIn: boolean;
  currentUser: UserProfile | null;
  aiSettings: AISettings;
  preferences: UserPreferences;

  login: (profile: UserProfile) => Promise<void>;
  logout: () => void;
  loadSettings: (userId: number) => Promise<void>;
  updateAISettings: (settings: Partial<AISettings>) => void;
  updatePreferences: (prefs: Partial<UserPreferences>) => void;
}

const defaultAISettings: AISettings = { apiKey: "", baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash", temperature: 0.7, maxTokens: 2048 };
const defaultPreferences: UserPreferences = { fontSize: 16, lineHeight: 1.6, fontFamily: "system", theme: "light", language: "zh" };

export const useUserStore = create<UserState>()((set, get) => ({
  isLoggedIn: false, currentUser: null,
  aiSettings: { ...defaultAISettings }, preferences: { ...defaultPreferences },

  login: async (profile) => {
    set({ isLoggedIn: true, currentUser: profile });
    await get().loadSettings(profile.id);
  },

  logout: () => set({ isLoggedIn: false, currentUser: null, aiSettings: { ...defaultAISettings } }),

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
}));
