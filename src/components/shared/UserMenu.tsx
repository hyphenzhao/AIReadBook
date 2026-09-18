"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User, Settings, Brain, LogOut, Search, Network } from "lucide-react";
import { useUserStore } from "@/stores/user-store";

export function UserMenu() {
  const { isLoggedIn, currentUser, logout } = useUserStore();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--accent)]"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--primary)] text-xs text-white">
          {isLoggedIn && currentUser
            ? currentUser.displayName[0]?.toUpperCase()
            : <User className="h-3.5 w-3.5" />}
        </div>
        <span className="hidden sm:inline text-[var(--foreground)]">
          {isLoggedIn && currentUser
            ? (currentUser.displayName || currentUser.email?.split("@")[0] || "用户")
            : "未登录"}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 rounded-lg border border-[var(--border)] bg-[var(--card)] py-1 shadow-lg z-50">
          {isLoggedIn && currentUser && (
            <>
              <div className="px-3 py-2 border-b border-[var(--border)]">
                <p className="text-sm font-medium">{currentUser.displayName || currentUser.email?.split("@")[0] || "用户"}</p>
                <p className="text-xs text-[var(--muted-foreground)]">{currentUser.email}</p>
              </div>
            </>
          )}

          <Link
            href="/search"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--accent)]"
          >
            <Search className="h-4 w-4" />
            发现书籍
          </Link>
          <Link
            href="/mind-maps"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--accent)]"
          >
            <Network className="h-4 w-4" />
            思维导图
          </Link>
          <Link
            href="/review"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--accent)]"
          >
            <Brain className="h-4 w-4" />
            间隔复习
          </Link>

          <div className="border-t border-[var(--border)] mt-1 pt-1">
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--accent)]"
            >
              <Settings className="h-4 w-4" />
              设置
            </Link>
            {isLoggedIn ? (
              <button
                onClick={async () => {
                  await logout();
                  setOpen(false);
                  router.push("/login");
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-[var(--accent)]"
              >
                <LogOut className="h-4 w-4" />
                退出登录
              </button>
            ) : (
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--accent)]"
              >
                <User className="h-4 w-4" />
                登录
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
