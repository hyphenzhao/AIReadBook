"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus, Type } from "lucide-react";
import { useUserStore, type UserPreferences } from "@/stores/user-store";

const FONTS: { value: string; label: string }[] = [
  { value: "system", label: "系统" },
  { value: '"Songti SC", "Noto Serif CJK SC", "Source Han Serif SC", SimSun, serif', label: "宋体" },
  { value: '"Kaiti SC", "STKaiti", KaiTi, serif', label: "楷体" },
];
const THEMES: { value: UserPreferences["theme"]; label: string; swatch: string }[] = [
  { value: "light", label: "浅色", swatch: "bg-white border-gray-300" },
  { value: "sepia", label: "护眼", swatch: "bg-[#f4ecd8] border-[#d8c9a3]" },
  { value: "dark", label: "深色", swatch: "bg-[#1a1a1a] border-gray-600" },
];
const LINE_HEIGHTS = [1.5, 1.8, 2.1];

/** Font size, line height, typeface and theme — adjustable without leaving the page. */
export function ReadingSettings() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const preferences = useUserStore((s) => s.preferences);
  const update = useUserStore((s) => s.updatePreferences);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const step = "flex h-10 w-10 items-center justify-center rounded-md border border-[var(--border)] hover:bg-[var(--accent)] disabled:opacity-40";
  const choice = (active: boolean) =>
    `flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-md border px-2 text-sm ${
      active ? "border-[var(--primary)] bg-[var(--primary)]/10 font-medium" : "border-[var(--border)] hover:bg-[var(--accent)]"
    }`;

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label="阅读设置"
        title="阅读设置"
        className={`flex h-10 w-10 items-center justify-center rounded hover:bg-[var(--accent)] ${open ? "text-[var(--primary)]" : ""}`}
      >
        <Type className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-72 space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-xl">
          <div>
            <p className="mb-1.5 text-xs text-[var(--muted-foreground)]">字号</p>
            <div className="flex items-center gap-2">
              <button className={step} aria-label="减小字号" disabled={preferences.fontSize <= 12} onClick={() => update({ fontSize: preferences.fontSize - 1 })}><Minus className="h-4 w-4" /></button>
              <span className="flex-1 text-center text-sm tabular-nums">{preferences.fontSize}</span>
              <button className={step} aria-label="增大字号" disabled={preferences.fontSize >= 28} onClick={() => update({ fontSize: preferences.fontSize + 1 })}><Plus className="h-4 w-4" /></button>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs text-[var(--muted-foreground)]">行距</p>
            <div className="flex gap-1.5">
              {LINE_HEIGHTS.map((value, i) => (
                <button key={value} className={choice(Math.abs(preferences.lineHeight - value) < 0.16)} onClick={() => update({ lineHeight: value })}>
                  {["紧凑", "适中", "宽松"][i]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs text-[var(--muted-foreground)]">字体</p>
            <div className="flex gap-1.5">
              {FONTS.map((font) => (
                <button
                  key={font.label}
                  className={choice(preferences.fontFamily === font.value)}
                  style={{ fontFamily: font.value === "system" ? undefined : font.value }}
                  onClick={() => update({ fontFamily: font.value })}
                >
                  {font.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs text-[var(--muted-foreground)]">主题</p>
            <div className="flex gap-1.5">
              {THEMES.map((theme) => (
                <button key={theme.value} className={choice(preferences.theme === theme.value)} onClick={() => update({ theme: theme.value })}>
                  <span className={`h-3.5 w-3.5 rounded-full border ${theme.swatch}`} />{theme.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
