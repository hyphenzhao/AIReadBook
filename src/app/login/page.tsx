"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUserStore } from "@/stores/user-store";
import { apiGetAuthConfig, apiLogin, errorMessage } from "@/lib/api-client-v2";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    let user;
    try {
      user = await apiLogin(email, password);
    } catch (err) {
      // The server says which it is: wrong credentials (401) or an outage.
      setError(errorMessage(err, "登录失败，请稍后重试"));
      setLoading(false);
      return;
    }

    // The session cookie is set at this point, so nothing below may block
    // the redirect. Books and annotations load from Providers once the
    // store has a user.
    void useUserStore.getState().login({
      id: user.id,
      displayName: user.name || email.split("@")[0],
      email: user.email,
      avatarUrl: null,
      role: user.role === "ADMIN" ? "ADMIN" : "USER",
    });
    const next = new URLSearchParams(window.location.search).get("next");
    router.push(next?.startsWith("/") && !next.startsWith("//") ? next : "/library");
  }

  const [notice, setNotice] = useState("");
  const [registrationOpen, setRegistrationOpen] = useState(false);
  useEffect(() => {
    apiGetAuthConfig().then((c) => setRegistrationOpen(c.registrationOpen)).catch(() => {});
  }, []);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("reason") === "expired") {
      setNotice("登录已过期，请重新登录");
    }
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Sparkles className="mx-auto mb-3 h-10 w-10 text-[var(--primary)]" />
          <h1 className="text-2xl font-bold">登录 AIReadBook</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">AI 深度阅读助手</p>
        </div>

        {notice && !error && (
          <p className="mb-4 rounded-md border border-[var(--border)] bg-[var(--accent)] px-3 py-2 text-sm">{notice}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">邮箱</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">密码</label>
            <div className="relative">
              <Input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-[var(--destructive)]">{error}</p>}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "登录中..." : "登录"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--muted-foreground)]">
          {registrationOpen ? (
            <>
              还没有账号？{" "}
              <Link href="/register" className="text-[var(--primary)] hover:underline">
                注册
              </Link>
            </>
          ) : (
            "没有账号？请联系管理员创建。"
          )}
        </p>
      </div>
    </div>
  );
}
