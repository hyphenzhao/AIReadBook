"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Settings, User, Brain, BookOpen, Key, Save, Eye, EyeOff, LogOut, Database, Download, Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUserStore } from "@/stores/user-store";

type TabId = "profile" | "ai" | "reading" | "account" | "data";

export default function SettingsPage() {
  const router = useRouter();
  const {
    isLoggedIn, currentUser, aiSettings, preferences,
    login, logout, updateAISettings, updatePreferences,
  } = useUserStore();

  const [activeTab, setActiveTab] = useState<TabId>("ai");
  const [showKey, setShowKey] = useState(false);

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
    setProfileLoading(true); setProfileMsg("");
    try {
      const res = await fetch("/api/v2/user/settings", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUser?.id, name: displayName }),
      });
      const data = await res.json();
      if (data.ok) { setProfileMsg("已保存"); setTimeout(() => setProfileMsg(""), 2000); }
      else setProfileMsg("保存失败");
    } catch { setProfileMsg("网络错误"); }
    setProfileLoading(false);
  }

  async function handleChangePassword() {
    if (!oldPw || !newPw) { setPwMsg("请填写旧密码和新密码"); return; }
    setPwLoading(true); setPwMsg("");
    try {
      const res = await fetch("/api/v2/auth", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "changePassword", userId: currentUser?.id, oldPassword: oldPw, newPassword: newPw }),
      });
      const data = await res.json();
      if (data.ok) { setPwMsg("密码修改成功"); setOldPw(""); setNewPw(""); }
      else { setPwMsg(data.error || "修改失败"); }
    } catch { setPwMsg("网络错误"); }
    setPwLoading(false);
  }
  const [apiKey, setApiKey] = useState(aiSettings.apiKey);
  const [baseUrl, setBaseUrl] = useState(aiSettings.baseUrl);
  const [model, setModel] = useState(aiSettings.model);
  const [temperature, setTemperature] = useState(aiSettings.temperature);
  const [maxTokens, setMaxTokens] = useState(aiSettings.maxTokens);
  const [fontSize, setFontSize] = useState(preferences.fontSize);
  const [theme, setTheme] = useState(preferences.theme);
  const [saved, setSaved] = useState(false);

  const tabs: { id: TabId; label: string; icon: typeof Settings }[] = [
    { id: "profile", label: "个人资料", icon: User },
    { id: "ai", label: "AI 设置", icon: Brain },
    { id: "reading", label: "阅读偏好", icon: BookOpen },
    { id: "account", label: "账号安全", icon: Key },
    { id: "data", label: "数据管理", icon: Database },
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
    const { apiLogin } = await import("@/lib/api-client-v2");
    const user = await apiLogin(email, password || "");
    if (user.error) return;
    await login({ id: user.id, displayName: user.name || email.split("@")[0] || "读者", email: user.email, avatarUrl: null });
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  function handleSaveAI() {
    updateAISettings({ apiKey, baseUrl, model, temperature, maxTokens });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
        <div className="flex gap-6">
          {/* Side tabs */}
          <nav className="w-44 shrink-0 space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                  activeTab === tab.id
                    ? "bg-[var(--primary)]/10 font-medium text-[var(--primary)]"
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
                      <Button onClick={handleLogin}>保存并登录</Button>
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
                      {profileMsg && <p className={`text-sm ${profileMsg.includes("失败") ? "text-red-500" : "text-green-500"}`}>{profileMsg}</p>}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "ai" && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">AI 设置</h2>
                <div className="rounded-lg border border-[var(--border)] p-6 space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium">DeepSeek API Key</label>
                    <div className="relative">
                      <Input
                        type={showKey ? "text" : "password"}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="sk-..."
                      />
                      <button
                        onClick={() => setShowKey(!showKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]"
                      >
                        {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                      密钥存储在本地，不会上传到任何服务器
                    </p>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium">API Base URL</label>
                    <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium">模型</label>
                      <select
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        className="h-9 w-full rounded-md border border-[var(--border)] bg-transparent px-3 text-sm"
                      >
                        <option value="deepseek-v4-flash">DeepSeek V4 Flash (快速)</option>
                        <option value="deepseek-v4-pro">DeepSeek V4 Pro (高质量)</option>
                        <option value="deepseek-chat">DeepSeek V3 Chat (即将弃用)</option>
                        <option value="deepseek-reasoner">DeepSeek R1 Reasoner (即将弃用)</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">Temperature</label>
                      <Input
                        type="number"
                        min={0}
                        max={2}
                        step={0.1}
                        value={temperature}
                        onChange={(e) => setTemperature(parseFloat(e.target.value))}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium">Max Tokens</label>
                    <Input
                      type="number"
                      min={256}
                      max={8192}
                      step={256}
                      value={maxTokens}
                      onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                    />
                  </div>

                  <Button onClick={handleSaveAI} className="gap-2">
                    <Save className="h-4 w-4" />
                    {saved ? "已保存 ✓" : "保存 AI 设置"}
                  </Button>
                </div>
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
                              ? "border-[var(--primary)] bg-[var(--primary)]/10 font-medium"
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
                    保存偏好
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
                          退出登录将清除本地存储的 AI 设置
                        </p>
                        <Button
                          variant="destructive"
                          onClick={() => {
                            logout();
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

            {activeTab === "data" && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">数据管理</h2>
                <div className="rounded-lg border border-[var(--border)] p-6 space-y-6">
                  <div>
                    <h3 className="mb-2 text-sm font-medium">📡 数据存储</h3>
                    <p className="mb-3 text-sm text-[var(--muted-foreground)]">
                      数据已自动保存在服务器 MySQL 中。登录后所有设备自动同步。
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
