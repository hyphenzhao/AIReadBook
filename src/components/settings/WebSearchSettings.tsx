"use client";

import { useEffect, useState } from "react";
import { Globe, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  apiAdminGetSettings, apiAdminSaveSettings, apiAdminTestWebSearch, errorMessage, type WebSearchConfig,
} from "@/lib/api-client-v2";

type Status = { kind: "ok" | "error"; text: string } | null;

/** Admin-only: the search provider 伴读 uses for background and commentary. */
export function WebSearchSettings() {
  const [config, setConfig] = useState<WebSearchConfig | null>(null);
  const [provider, setProvider] = useState<"bocha" | "tavily">("bocha");
  const [apiKey, setApiKey] = useState("");
  const [dailyLimit, setDailyLimit] = useState("100");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    apiAdminGetSettings()
      .then(({ webSearch }) => {
        setConfig(webSearch);
        setProvider(webSearch.provider);
        setDailyLimit(String(webSearch.dailyLimit));
      })
      .catch((e) => setStatus({ kind: "error", text: errorMessage(e, "无法读取联网搜索设置") }));
  }, []);

  async function save(clearKey = false) {
    const limit = Number(dailyLimit);
    if (!Number.isInteger(limit) || limit < 0) return setStatus({ kind: "error", text: "每日次数需为非负整数" });
    setBusy(true);
    setStatus(null);
    try {
      const { webSearch } = await apiAdminSaveSettings({
        webSearch: { provider, dailyLimit: limit, ...(clearKey ? { apiKey: "" } : apiKey.trim() ? { apiKey: apiKey.trim() } : {}) },
      });
      setConfig(webSearch);
      setApiKey("");
      setStatus({ kind: "ok", text: clearKey ? "已清除 Key，联网搜索已停用" : "已保存" });
    } catch (e) {
      setStatus({ kind: "error", text: errorMessage(e, "保存失败") });
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setStatus(null);
    try {
      const result = await apiAdminTestWebSearch();
      setStatus({ kind: "ok", text: `搜索正常，返回 ${result.count} 条${result.sample ? `，例如「${result.sample}」` : ""}` });
    } catch (e) {
      setStatus({ kind: "error", text: errorMessage(e, "测试失败") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-lg border border-[var(--border)] p-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-medium"><Globe className="h-4 w-4" />联网搜索</h3>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          伴读在读者问到背景、评价，或书中找不到依据时，会用它搜索书评和背景知识。全站共用一个 Key；未配置时伴读只依据书内原文。
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="ws-provider" className="mb-1 block text-sm">搜索服务</label>
          <select
            id="ws-provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value as "bocha" | "tavily")}
            className="h-9 w-full rounded-md border border-[var(--border)] bg-transparent px-3 text-sm"
          >
            <option value="bocha">博查 Bocha（国内直连）</option>
            <option value="tavily">Tavily</option>
          </select>
        </div>
        <div>
          <label htmlFor="ws-limit" className="mb-1 block text-sm">每人每日次数上限</label>
          <Input id="ws-limit" type="number" inputMode="numeric" min={0} value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} />
        </div>
      </div>

      <div>
        <label htmlFor="ws-key" className="mb-1 block text-sm">API Key</label>
        <Input
          id="ws-key"
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={config?.hasKey ? `已保存 ${config.keyHint}（留空则保持不变）` : config?.keyHint || "在 open.bochaai.com 或 tavily.com 申请"}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => save()} disabled={busy} className="gap-1"><Save className="h-4 w-4" />保存</Button>
        <Button variant="outline" onClick={test} disabled={busy || !config?.hasKey}>测试搜索</Button>
        {config?.hasKey && <Button variant="outline" onClick={() => save(true)} disabled={busy}>清除 Key</Button>}
        {status && <p role="status" className={`text-sm ${status.kind === "ok" ? "text-green-600" : "text-red-500"}`}>{status.text}</p>}
      </div>
    </section>
  );
}
