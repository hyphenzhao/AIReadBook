"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Settings, User, Users, Brain, BookOpen, Key, Save, LogOut, Database, Download, Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUserStore } from "@/stores/user-store";
import { AISettingsForm } from "@/components/settings/AISettingsForm";
import { UserManagement } from "@/components/settings/UserManagement";
import { apiChangePassword, apiLogin, apiSaveUserName, errorMessage } from "@/lib/api-client-v2";

type TabId = "profile" | "ai" | "reading" | "account" | "data" | "users";

export default function SettingsPage() {
  const router = useRouter();
  const {
    isLoggedIn, currentUser, preferences,
    login, setProfile, logout, updatePreferences,
  } = useUserStore();

  const [activeTab, setActiveTab] = useState<TabId>("ai");

  // Form states
  const [displayName, setDisplayName] = useState(currentUser?.displayName || "");
  const [email, setEmail] = useState(currentUser?.email || "");
  const [password, setPassword] = useState("");
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [profileMsg, setProfileMsg] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);

  async function handleSaveProfile() {
    if (!displayName.trim() || !currentUser) {
      setProfileMsg("显示名称不能为空");
      return;
    }
    setProfileLoading(true); setProfileMsg("");
    try {
      await apiSaveUserName(displayName.trim());
      setProfile({ displayName: displayName.trim() });
      setProfileMsg("已保存");
      setTimeout(() => setProfileMsg(""), 2000);
    } catch (error) {
      setProfileMsg(errorMessage(error, "保存失败"));
    }
    setProfileLoading(false);
  }

  async function handleChangePassword() {
    if (!oldPw || !newPw) { setPwMsg("请填写旧密码和新密码"); return; }
    setPwLoading(true); setPwMsg("");
    try {
      await apiChangePassword(oldPw, newPw);
      setPwMsg("密码修改成功"); setOldPw(""); setNewPw("");
    } catch (error) {
      setPwMsg(errorMessage(error, "修改失败"));
    }
    setPwLoading(false);
  }
  const [fontSize, setFontSize] = useState(preferences.fontSize);
  const [theme, setTheme] = useState(preferences.theme);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (requested && ["profile", "ai", "reading", "account", "data", "users"].includes(requested)) {
      setActiveTab(requested as TabId);
    }
  }, []);

  useEffect(() => {
    setDisplayName(currentUser?.displayName || "");
    setEmail(currentUser?.email || "");
  }, [currentUser]);

  useEffect(() => {
    setFontSize(preferences.fontSize);
    setTheme(preferences.theme);
  }, [preferences]);

  const tabs: { id: TabId; label: string; icon: typeof Settings }[] = [
    { id: "profile", label: "个人资料", icon: User },
    { id: "ai", label: "AI 设置", icon: Brain },
    { id: "reading", label: "阅读偏好", icon: BookOpen },
    { id: "account", label: "账号安全", icon: Key },
    { id: "data", label: "数据管理", icon: Database },
    // The API enforces this too; hiding the tab is only a courtesy.
    ...(currentUser?.role === "ADMIN" ? [{ id: "users" as const, label: "用户管理", icon: Users }] : []),
  ];

  // --- Data export/import ---
  const [importMsg, setImportMsg] = useState("");

  function handleExport() {
    const keys = [
      "aireadbook-library",
      "aireadbook-annotations",
      "aireadbook-knowledge",
      "aireadbook-review",
      "aireadbook-chat",
      "aireadbook-user",
      "aireadbook-ui",
    ];
    const data: Record<string, unknown> = {};
    for (const key of keys) {
      const raw = localStorage.getItem(key);
      data[key] = raw ? JSON.parse(raw) : null;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aireadbook-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        let count = 0;
        for (const [key, value] of Object.entries(data)) {
          if (key.startsWith("aireadbook-") && value) {
            localStorage.setItem(key, JSON.stringify(value));
            count++;
          }
        }
        setImportMsg(`已导入 ${count} 个数据项。请刷新页面使数据生效。`);
      } catch {
        setImportMsg("文件格式错误，请选择有效的备份文件。");
      }
    };
    input.click();
  }

  async function handleLogin() {
    setProfileMsg("");
    try {
      const user = await apiLogin(email, password || "");
      await login({ id: user.id, displayName: user.name || email.split("@")[0] || "读者", email: user.email, avatarUrl: null, role: user.role === "ADMIN" ? "ADMIN" : "USER" });
    } catch (error) {
      setProfileMsg(errorMessage(error, "登录失败"));
    }
  }

  function handleSavePreferences() {
    updatePreferences({ fontSize, theme });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-6 py-4">
          <Link href="/library" className="rounded p-1 hover:bg-[var(--accent)]">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-semibold">设置</h1>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-6">
        <div className="flex flex-col gap-6 sm:flex-row">
          {/* Side tabs */}
          <nav className="flex w-full shrink-0 gap-1 overflow-x-auto sm:block sm:w-44 sm:space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors sm:w-full ${
                  activeTab === tab.id
                    ? "bg-[var(--primary-soft)] font-medium text-[var(--primary)]"
                    : "text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Content */}
          <div className="flex-1">
            {activeTab === "profile" && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">个人资料</h2>
                {!isLoggedIn ? (
                  <div className="rounded-lg border border-[var(--border)] p-6">
                    <p className="mb-4 text-sm text-[var(--muted-foreground)]">
                      设置个人资料以启用个性化功能
                    </p>
                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-sm">显示名称</label>
                        <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="你的名字" />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm">邮箱</label>
                        <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="your@email.com" />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm">密码</label>
                        <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" />
                      </div>
                      <Button onClick={handleLogin}>登录</Button>
                      {profileMsg && <p className="text-sm text-red-500">{profileMsg}</p>}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-[var(--border)] p-6">
                    <div className="mb-4 flex items-center gap-4">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--primary)] text-2xl text-white">
                        {currentUser?.displayName?.[0]?.toUpperCase() || "?"}
                      </div>
                      <div>
                        <p className="font-semibold">{currentUser?.displayName}</p>
                        <p className="text-sm text-[var(--muted-foreground)]">{currentUser?.email}</p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-sm">显示名称</label>
                        <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                      </div>
                      <Button onClick={handleSaveProfile} disabled={profileLoading} className="gap-2">
                        <Save className="h-4 w-4" />
                        {profileLoading ? "保存中..." : "保存名称"}
                      </Button>
                      {profileMsg && <p className={`text-sm ${profileMsg === "已保存" ? "text-green-500" : "text-red-500"}`}>{profileMsg}</p>}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "ai" && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">AI 设置</h2>
                <AISettingsForm />
              </div>
            )}

            {activeTab === "reading" && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">阅读偏好</h2>
                <div className="rounded-lg border border-[var(--border)] p-6 space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium">默认字体大小</label>
                    <Input
                      type="number"
                      min={12}
                      max={28}
                      value={fontSize}
                      onChange={(e) => setFontSize(parseInt(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">主题</label>
                    <div className="flex gap-2">
                      {(["light", "dark", "sepia"] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() => setTheme(t)}
                          className={`rounded-lg border px-4 py-2 text-sm transition-colors ${
                            theme === t
                              ? "border-[var(--primary)] bg-[var(--primary-soft)] font-medium"
                              : "border-[var(--border)] hover:bg-[var(--accent)]"
                          }`}
                        >
                          {t === "light" ? "☀️ 浅色" : t === "dark" ? "🌙 深色" : "📜 护眼"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Button onClick={handleSavePreferences} className="gap-2">
                    <Save className="h-4 w-4" />
                    {saved ? "已保存 ✓" : "保存偏好"}
                  </Button>
                </div>
              </div>
            )}

            {activeTab === "account" && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">账号安全</h2>
                <div className="rounded-lg border border-[var(--border)] p-6 space-y-4">
                  {isLoggedIn ? (
                    <>
                      <div className="space-y-3">
                        <div>
                          <label className="mb-1 block text-sm font-medium">当前邮箱</label>
                          <Input value={currentUser?.email || ""} disabled />
                        </div>
                        <div>
                          <label className="mb-1 block text-sm font-medium">旧密码</label>
                          <Input type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} placeholder="输入当前密码" />
                        </div>
                        <div>
                          <label className="mb-1 block text-sm font-medium">新密码</label>
                          <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="输入新密码" />
                        </div>
                        <Button variant="outline" onClick={handleChangePassword} disabled={pwLoading}>
                          {pwLoading ? "修改中..." : "修改密码"}
                        </Button>
                        {pwMsg && (
                          <p className={`text-sm ${pwMsg.includes("成功") ? "text-green-500" : "text-red-500"}`}>
                            {pwMsg}
                          </p>
                        )}
                      </div>
                      <hr className="border-[var(--border)]" />
                      <div>
                        <p className="mb-2 text-sm text-[var(--muted-foreground)]">
                          退出后需要重新登录才能访问书库
                        </p>
                        <Button
                          variant="destructive"
                          onClick={async () => {
                            await logout();
                            router.push("/login");
                          }}
                          className="gap-2"
                        >
                          <LogOut className="h-4 w-4" />
                          退出登录
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8">
                      <Key className="mx-auto mb-3 h-8 w-8 text-[var(--muted-foreground)]" />
                      <p className="text-sm text-[var(--muted-foreground)]">请先登录</p>
                      <Link href="/login" className="mt-3 inline-block">
                        <Button size="sm">去登录</Button>
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "users" && currentUser?.role === "ADMIN" && <UserManagement />}

            {activeTab === "data" && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">数据管理</h2>
                <div className="rounded-lg border border-[var(--border)] p-6 space-y-6">
                  <div>
                    <h3 className="mb-2 text-sm font-medium">📡 数据存储</h3>
                    <p className="mb-3 text-sm text-[var(--muted-foreground)]">
                      书籍、章节、批注、聊天和账户设置保存在服务器；知识卡片、思维导图与复习进度目前保存在当前浏览器。
                    </p>
                  </div>
                  <hr className="border-[var(--border)]" />
                  <div>
                    <h3 className="mb-2 text-sm font-medium">💾 文件备份</h3>
                    <p className="mb-3 text-sm text-[var(--muted-foreground)]">
                      将当前浏览器缓存导出为 JSON 文件备份。
                    </p>
                    <div className="flex gap-2">
                      <Button onClick={handleExport} variant="outline" className="gap-2">
                        <Download className="h-4 w-4" />导出备份
                      </Button>
                      <Button onClick={handleImport} variant="outline" className="gap-2">
                        <Upload className="h-4 w-4" />导入备份
                      </Button>
                    </div>
                    {importMsg && (
                      <p className={`mt-2 text-sm ${importMsg.includes("错误") ? "text-red-500" : "text-green-500"}`}>
                        {importMsg}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
