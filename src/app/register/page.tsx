"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUserStore } from "@/stores/user-store";
import { apiGetAuthConfig, apiRegister, errorMessage } from "@/lib/api-client-v2";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // null while unknown, so the form does not flash before "closed" shows.
  const [registrationOpen, setRegistrationOpen] = useState<boolean | null>(null);
  useEffect(() => {
    apiGetAuthConfig().then((c) => setRegistrationOpen(c.registrationOpen)).catch(() => setRegistrationOpen(true));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    let user;
    try {
      user = await apiRegister(email, password, email.split("@")[0]);
    } catch (err) {
      setError(errorMessage(err, "注册失败，请稍后重试"));
      setLoading(false);
      return;
    }

    void useUserStore.getState().login({
      id: user.id,
      displayName: user.name || email.split("@")[0],
      email: user.email,
      avatarUrl: null,
      role: user.role === "ADMIN" ? "ADMIN" : "USER",
    });
    router.push("/library");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Sparkles className="mx-auto mb-3 h-10 w-10 text-[var(--primary)]" />
          <h1 className="text-2xl font-bold">注册 AIReadBook</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">开始你的 AI 深度阅读之旅</p>
        </div>

        {registrationOpen === false && (
          <p className="rounded-md border border-[var(--border)] bg-[var(--accent)] px-3 py-3 text-center text-sm">
            本站未开放注册，请联系管理员为你创建账号。
          </p>
        )}

        <form onSubmit={handleSubmit} className={registrationOpen ? "space-y-4" : "hidden"}>
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
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 8 个字符"
              required
              minLength={8}
            />
          </div>

          {error && <p className="text-sm text-[var(--destructive)]">{error}</p>}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "注册中..." : "创建账号"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--muted-foreground)]">
          已有账号？{" "}
          <Link href="/login" className="text-[var(--primary)] hover:underline">
            登录
          </Link>
        </p>
      </div>
    </div>
  );
}
