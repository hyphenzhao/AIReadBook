"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, RefreshCw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUserStore } from "@/stores/user-store";
import { apiListModels, errorMessage } from "@/lib/api-client-v2";

type Status = { kind: "ok" | "error"; text: string } | null;

export function AISettingsForm() {
  const aiSettings = useUserStore((s) => s.aiSettings);
  const loaded = useUserStore((s) => s.aiSettingsLoaded);
  const sessionReady = useUserStore((s) => s.sessionReady);
  const isLoggedIn = useUserStore((s) => s.isLoggedIn);
  const saveAISettings = useUserStore((s) => s.saveAISettings);

  // The key field only ever holds a *new* key. The saved one stays on the server.
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  // Kept as text so a half-typed number is never coerced to NaN.
  const [temperature, setTemperature] = useState("");
  const [maxTokens, setMaxTokens] = useState("");

  const [models, setModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsStatus, setModelsStatus] = useState<Status>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  // Seed the form exactly once, when the server values arrive. Re-seeding on
  // every store update is what used to wipe out text the user was typing.
  const seeded = useRef(false);
  useEffect(() => {
    if (!loaded || seeded.current) return;
    seeded.current = true;
    setBaseUrl(aiSettings.baseUrl);
    setModel(aiSettings.model);
    setTemperature(String(aiSettings.temperature));
    setMaxTokens(String(aiSettings.maxTokens));
  }, [loaded, aiSettings]);

  async function loadModels(silent = false) {
    setModelsLoading(true);
    if (!silent) setModelsStatus(null);
    try {
      const { models: list } = await apiListModels({ apiKey: apiKey.trim() || undefined, baseUrl: baseUrl.trim() || undefined });
      setModels(list);
      if (!silent) setModelsStatus({ kind: "ok", text: `连接成功，共 ${list.length} 个模型` });
    } catch (error) {
      setModels([]);
      if (!silent) setModelsStatus({ kind: "error", text: errorMessage(error, "获取模型列表失败") });
    } finally {
      setModelsLoading(false);
    }
  }

  // Fetch the list up front when saved credentials already work.
  const autoFetched = useRef(false);
  useEffect(() => {
    if (!loaded || autoFetched.current || !aiSettings.ready) return;
    autoFetched.current = true;
    void loadModels(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, aiSettings.ready]);

  async function handleSave() {
    const t = Number(temperature);
    const m = Number(maxTokens);
    if (!baseUrl.trim()) return setStatus({ kind: "error", text: "请填写 API Base URL" });
    if (!model.trim()) return setStatus({ kind: "error", text: "请选择或填写模型" });
    if (!Number.isFinite(t) || t < 0 || t > 2) return setStatus({ kind: "error", text: "Temperature 需在 0–2 之间" });
    if (!Number.isInteger(m) || m < 256 || m > 8192) return setStatus({ kind: "error", text: "Max Tokens 需为 256–8192 的整数" });

    setSaving(true);
    setStatus(null);
    try {
      await saveAISettings({
        // Omitting apiKey tells the server to keep the stored one.
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        baseUrl: baseUrl.trim(), model: model.trim(), temperature: t, maxTokens: m,
      });
      setApiKey("");
      setShowKey(false);
      setStatus({ kind: "ok", text: "已保存" });
    } catch (error) {
      setStatus({ kind: "error", text: errorMessage(error, "保存失败，请稍后重试") });
    } finally {
      setSaving(false);
    }
  }

  async function handleClearKey() {
    setSaving(true);
    setStatus(null);
    try {
      await saveAISettings({ apiKey: "" });
      setApiKey("");
      setStatus({ kind: "ok", text: "已清除保存的 API Key" });
    } catch (error) {
      setStatus({ kind: "error", text: errorMessage(error, "清除失败，请稍后重试") });
    } finally {
      setSaving(false);
    }
  }

  if (sessionReady && !isLoggedIn) {
    return <p className="rounded-lg border border-[var(--border)] p-6 text-sm text-[var(--muted-foreground)]">请先登录后再配置 AI。</p>;
  }
  if (!loaded) {
    return <p className="rounded-lg border border-[var(--border)] p-6 text-sm text-[var(--muted-foreground)]">正在加载 AI 设置…</p>;
  }

  const keyPlaceholder = aiSettings.hasKey
    ? `已保存 ${aiSettings.keyHint}（留空则保持不变）`
    : aiSettings.keyHint || "sk-...";

  return (
    <div className="space-y-4 rounded-lg border border-[var(--border)] p-6">
      <div>
        <label htmlFor="ai-key" className="mb-1 block text-sm font-medium">API Key</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              id="ai-key"
              type={showKey ? "text" : "password"}
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={keyPlaceholder}
              className="pr-10"
            />
            <button
              type="button"
              aria-label={showKey ? "隐藏" : "显示"}
              onClick={() => setShowKey(!showKey)}
              className="absolute right-1 top-1/2 -translate-y-1/2 p-2 text-[var(--muted-foreground)]"
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {aiSettings.hasKey && (
            <Button type="button" variant="outline" onClick={handleClearKey} disabled={saving} className="shrink-0 gap-1">
              <Trash2 className="h-4 w-4" />清除
            </Button>
          )}
        </div>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          Key 加密保存在服务器，不会再回传到浏览器。
          {!aiSettings.hasKey && aiSettings.serverKeyAvailable && " 当前未设置个人 Key，将使用服务器提供的默认 Key。"}
        </p>
      </div>

      <div>
        <label htmlFor="ai-base-url" className="mb-1 block text-sm font-medium">API Base URL</label>
        <Input id="ai-base-url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.deepseek.com" />
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">任何 OpenAI 兼容接口均可。内网地址需管理员加入白名单。</p>
      </div>

      <div>
        <label htmlFor="ai-model" className="mb-1 block text-sm font-medium">模型</label>
        <div className="flex gap-2">
          <Input
            id="ai-model"
            list="ai-model-options"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="从列表选择，或直接输入模型名"
            className="flex-1"
          />
          <datalist id="ai-model-options">
            {models.map((id) => <option key={id} value={id} />)}
          </datalist>
          <Button type="button" variant="outline" onClick={() => loadModels()} disabled={modelsLoading} className="shrink-0 gap-1">
            <RefreshCw className={`h-4 w-4 ${modelsLoading ? "animate-spin" : ""}`} />
            {modelsLoading ? "获取中" : "获取模型"}
          </Button>
        </div>
        {modelsStatus && (
          <p className={`mt-1 text-xs ${modelsStatus.kind === "ok" ? "text-green-600" : "text-red-500"}`}>{modelsStatus.text}</p>
        )}
        {models.length > 0 && model && !models.includes(model) && (
          <p className="mt-1 text-xs text-amber-600">当前填写的模型不在服务返回的列表中。</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="ai-temperature" className="mb-1 block text-sm font-medium">Temperature</label>
          <Input id="ai-temperature" type="number" inputMode="decimal" min={0} max={2} step={0.1} value={temperature} onChange={(e) => setTemperature(e.target.value)} />
        </div>
        <div>
          <label htmlFor="ai-max-tokens" className="mb-1 block text-sm font-medium">Max Tokens</label>
          <Input id="ai-max-tokens" type="number" inputMode="numeric" min={256} max={8192} step={256} value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? "保存中…" : "保存 AI 设置"}
        </Button>
        {status && (
          <p role="status" className={`text-sm ${status.kind === "ok" ? "text-green-600" : "text-red-500"}`}>{status.text}</p>
        )}
      </div>
    </div>
  );
}
