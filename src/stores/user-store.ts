import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AISettings {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface UserPreferences {
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  theme: "light" | "dark" | "sepia";
  language: "zh" | "en";
}

export interface UserProfile {
  displayName: string;
  email: string;
  avatarUrl: string | null;
}

interface UserState {
  // Auth
  isLoggedIn: boolean;
  currentUser: UserProfile | null;

  // Settings
  aiSettings: AISettings;
  preferences: UserPreferences;

  // Actions
  login: (profile: UserProfile) => void;
  logout: () => void;
  updateProfile: (profile: Partial<UserProfile>) => void;
  updateAISettings: (settings: Partial<AISettings>) => void;
  updatePreferences: (prefs: Partial<UserPreferences>) => void;
}

const defaultAISettings: AISettings = {
  apiKey: "",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-v4-flash",
  temperature: 0.7,
  maxTokens: 2048,
};

const defaultPreferences: UserPreferences = {
  fontSize: 16,
  lineHeight: 1.6,
  fontFamily: "system",
  theme: "light",
  language: "zh",
};

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      isLoggedIn: false,
      currentUser: null,
      aiSettings: { ...defaultAISettings },
      preferences: { ...defaultPreferences },

      login: (profile) =>
        set({ isLoggedIn: true, currentUser: profile }),

      logout: () =>
        set({
          isLoggedIn: false,
          currentUser: null,
          aiSettings: { ...defaultAISettings },
        }),

      updateProfile: (profile) =>
        set((s) => ({
          currentUser: s.currentUser ? { ...s.currentUser, ...profile } : null,
        })),

      updateAISettings: (settings) =>
        set((s) => ({
          aiSettings: { ...s.aiSettings, ...settings },
        })),

      updatePreferences: (prefs) =>
        set((s) => ({
          preferences: { ...s.preferences, ...prefs },
        })),
    }),
    { name: "aireadbook-user" },
  ),
);
