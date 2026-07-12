import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UIState {
  theme: "light" | "dark" | "sepia";
  setTheme: (theme: "light" | "dark" | "sepia") => void;

  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;

  leftPanelWidth: number;
  rightPanelWidth: number;
  setLeftPanelWidth: (w: number) => void;
  setRightPanelWidth: (w: number) => void;

  // AI Panel position & size (persisted)
  aiPanelPosition: "right" | "bottom";
  aiPanelSize: number; // percentage for right (0.2-0.5), pixels for bottom (200-600)
  toggleAiPanelPosition: () => void;
  setAiPanelSize: (size: number) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: "light",
      setTheme: (theme) => set({ theme }),

      leftPanelOpen: true,
      rightPanelOpen: true,
      toggleLeftPanel: () => set((s) => ({ leftPanelOpen: !s.leftPanelOpen })),
      toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),

      leftPanelWidth: 0.2,
      rightPanelWidth: 0.3,
      setLeftPanelWidth: (w) => set({ leftPanelWidth: Math.max(0.15, Math.min(0.4, w)) }),
      setRightPanelWidth: (w) => set({ rightPanelWidth: Math.max(0.2, Math.min(0.5, w)) }),

      aiPanelPosition: "right",
      aiPanelSize: 0.3,
      toggleAiPanelPosition: () =>
        set((s) => ({
          aiPanelPosition: s.aiPanelPosition === "right" ? "bottom" : "right",
          // Swap size when toggling
          aiPanelSize: s.aiPanelPosition === "right" ? 350 : 0.3,
        })),
      setAiPanelSize: (size) => set({ aiPanelSize: size }),
    }),
    { name: "aireadbook-ui" },
  ),
);
