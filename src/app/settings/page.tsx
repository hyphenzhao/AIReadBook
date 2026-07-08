"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Settings, User, Brain, BookOpen, Key, Save, Eye, EyeOff, LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUserStore } from "@/stores/user-store";

type TabId = "profile" | "ai" | "reading" | "account";

export default function SettingsPage() {
  const router = useRouter();
  const {
    isLoggedIn, currentUser, aiSettings, preferences,
    login, logout, updateProfile, updateAISettings, updatePreferences,
  } = useUserStore();

  const [activeTab, setActiveTab] = useState<TabId>("ai");
  const [showKey, setShowKey] = useState(false);

  // Form states
  const [displayName, setDisplayName] = useState(currentUser?.displayName || "");
  const [email, setEmail] = useState(currentUser?.email || "");
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
  ];

  function handleLogin() {
    login({ displayName: displayName || email.split("@")[0] || "读者", email, avatarUrl: null });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
                        <Input value={displayName} onChange={(e) => { setDisplayName(e.target.value); updateProfile({ displayName: e.target.value }); }} />
                      </div>
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
                          <label className="mb-1 block text-sm font-medium">新密码</label>
                          <Input type="password" placeholder="••••••••" />
                        </div>
                        <div>
                          <label className="mb-1 block text-sm font-medium">确认新密码</label>
                          <Input type="password" placeholder="••••••••" />
                        </div>
                        <Button variant="outline">修改密码</Button>
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
          </div>
        </div>
      </div>
    </div>
  );
}
