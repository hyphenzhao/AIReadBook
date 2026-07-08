"use client";

import { type ReactNode } from "react";
import { useUIStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";

interface ReadingLayoutProps {
  leftPanel: ReactNode;
  centerPanel: ReactNode;
  rightPanel: ReactNode;
}

export function ReadingLayout({ leftPanel, centerPanel, rightPanel }: ReadingLayoutProps) {
  const { leftPanelOpen, rightPanelOpen, leftPanelWidth, rightPanelWidth } = useUIStore();

  const leftW = leftPanelOpen ? `${leftPanelWidth * 100}%` : "0px";
  const rightW = rightPanelOpen ? `${rightPanelWidth * 100}%` : "0px";

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--background)]">
      {/* Left Panel */}
      <div
        className={cn(
          "shrink-0 overflow-hidden border-r border-[var(--border)] transition-[width] duration-200",
        )}
        style={{ width: leftW }}
      >
        {leftPanelOpen && <div className="h-full w-full overflow-y-auto">{leftPanel}</div>}
      </div>

      {/* Center Panel (Reader) */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">{centerPanel}</div>

      {/* Right Panel (AI) */}
      <div
        className={cn(
          "shrink-0 overflow-hidden border-l border-[var(--border)] transition-[width] duration-200",
        )}
        style={{ width: rightW }}
      >
        {rightPanelOpen && <div className="h-full w-full overflow-hidden">{rightPanel}</div>}
      </div>
    </div>
  );
}
