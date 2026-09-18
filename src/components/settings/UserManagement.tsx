"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Pencil, Plus, ShieldCheck, Trash2, UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useUserStore } from "@/stores/user-store";
import { WebSearchSettings } from "@/components/settings/WebSearchSettings";
import {
  apiAdminCreateUser, apiAdminDeleteUser, apiAdminGetSettings, apiAdminListUsers,
  apiAdminSaveSettings, apiAdminUpdateUser, errorMessage,
  type AdminUser, type UserRole,
} from "@/lib/api-client-v2";

type Editor =
  | { mode: "create" }
  | { mode: "edit"; user: AdminUser }
  | { mode: "password"; user: AdminUser }
  | { mode: "delete"; user: AdminUser };

function formatDate(value: string | null) {
  if (!value) return "从未";
  return new Date(value).toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" });
}

export function UserManagement() {
  const selfId = useUserStore((s) => s.currentUser?.id);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [allowRegistration, setAllowRegistration] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);

  const reload = useCallback(async () => {
    try {
      const [{ users: list }, { settings }] = await Promise.all([apiAdminListUsers(), apiAdminGetSettings()]);
      setUsers(list);
      setAllowRegistration(settings.allowRegistration);
      setError("");
    } catch (e) {
      setError(errorMessage(e, "加载用户列表失败"));
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      setError("");
      await reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">用户管理</h2>
        <Button onClick={() => setEditor({ mode: "create" })} className="gap-1">
          <Plus className="h-4 w-4" />新建用户
        </Button>
      </div>

      {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">{error}</p>}

      <label className="flex items-start gap-3 rounded-lg border border-[var(--border)] p-4">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4"
          checked={!!allowRegistration}
          disabled={allowRegistration === null}
          onChange={(e) => run(() => apiAdminSaveSettings({ allowRegistration: e.target.checked }))}
        />
        <span>
          <span className="block text-sm font-medium">开放注册</span>
          <span className="block text-xs text-[var(--muted-foreground)]">
            关闭时，只有管理员可以在这里创建账号。局域网内任何人都能打开注册页，建议保持关闭。
          </span>
        </span>
      </label>

      {users === null && !error && <p className="text-sm text-[var(--muted-foreground)]">正在加载…</p>}

      <ul className="space-y-2">
        {users?.map((user) => {
          const isSelf = user.id === selfId;
          return (
            <li key={user.id} className="rounded-lg border border-[var(--border)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <span className="truncate">{user.name}</span>
                    {user.role === "ADMIN" && (
                      <span className="inline-flex items-center gap-1 rounded bg-[var(--primary)]/10 px-1.5 py-0.5 text-xs text-[var(--primary)]">
                        <ShieldCheck className="h-3 w-3" />管理员
                      </span>
                    )}
                    {user.disabled && <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-xs text-red-600">已停用</span>}
                    {isSelf && <span className="text-xs text-[var(--muted-foreground)]">（你）</span>}
                  </p>
                  <p className="truncate text-sm text-[var(--muted-foreground)]">{user.email}</p>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                    {user.bookCount} 本书 · 上次登录 {formatDate(user.lastLoginAt)} · 创建于 {formatDate(user.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => setEditor({ mode: "edit", user })}>
                    <Pencil className="h-3.5 w-3.5" />编辑
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => setEditor({ mode: "password", user })}>
                    <KeyRound className="h-3.5 w-3.5" />重置密码
                  </Button>
                  {!isSelf && (
                    <>
                      <Button
                        variant="outline" size="sm" className="gap-1"
                        onClick={() => run(() => apiAdminUpdateUser(user.id, { disabled: !user.disabled }))}
                      >
                        {user.disabled ? <UserCheck className="h-3.5 w-3.5" /> : <UserX className="h-3.5 w-3.5" />}
                        {user.disabled ? "启用" : "停用"}
                      </Button>
                      <Button variant="outline" size="sm" className="gap-1 text-red-600" onClick={() => setEditor({ mode: "delete", user })}>
                        <Trash2 className="h-3.5 w-3.5" />删除
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <h2 className="pt-4 text-lg font-semibold">系统设置</h2>
      <WebSearchSettings />

      <Dialog open={!!editor} onOpenChange={(open) => !open && setEditor(null)}>
        {editor && (
          <EditorDialog
            key={editor.mode + ("user" in editor ? editor.user.id : "")}
            editor={editor}
            isSelf={"user" in editor && editor.user.id === selfId}
            onDone={async () => { setEditor(null); await reload(); }}
          />
        )}
      </Dialog>
    </div>
  );
}

function EditorDialog({ editor, isSelf, onDone }: { editor: Editor; isSelf: boolean; onDone: () => Promise<void> }) {
  const existing = "user" in editor ? editor.user : null;
  const [name, setName] = useState(existing?.name ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [role, setRole] = useState<UserRole>(existing?.role ?? "USER");
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const title = {
    create: "新建用户",
    edit: `编辑 ${existing?.name}`,
    password: `重置 ${existing?.name} 的密码`,
    delete: `删除 ${existing?.name}`,
  }[editor.mode];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (editor.mode === "create") await apiAdminCreateUser({ email, password, name, role });
      if (editor.mode === "edit") {
        const { user } = await apiAdminUpdateUser(editor.user.id, {
          email,
          ...(name.trim() ? { name } : {}),
          ...(isSelf ? {} : { role }),
        });
        if (isSelf) useUserStore.getState().setProfile({ displayName: user.name, email: user.email });
      }
      if (editor.mode === "password") await apiAdminUpdateUser(editor.user.id, { password });
      if (editor.mode === "delete") await apiAdminDeleteUser(editor.user.id);
      await onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  const showIdentity = editor.mode === "create" || editor.mode === "edit";
  const showPassword = editor.mode === "create" || editor.mode === "password";
  const deleteBlocked = editor.mode === "delete" && confirmText.trim().toLowerCase() !== existing?.email.toLowerCase();

  return (
    <DialogContent className="max-w-md" aria-describedby={undefined}>
      <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-3">
        {showIdentity && (
          <>
            <div>
              <label htmlFor="um-email" className="mb-1 block text-sm">邮箱</label>
              <Input id="um-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label htmlFor="um-name" className="mb-1 block text-sm">显示名称</label>
              <Input id="um-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="留空则使用邮箱前缀" />
            </div>
            <div>
              <label htmlFor="um-role" className="mb-1 block text-sm">角色</label>
              <select
                id="um-role"
                value={role}
                disabled={isSelf}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="h-9 w-full rounded-md border border-[var(--border)] bg-transparent px-3 text-sm disabled:opacity-60"
              >
                <option value="USER">普通用户</option>
                <option value="ADMIN">管理员</option>
              </select>
              {isSelf && <p className="mt-1 text-xs text-[var(--muted-foreground)]">不能修改自己的角色。</p>}
            </div>
          </>
        )}

        {showPassword && (
          <div>
            <label htmlFor="um-password" className="mb-1 block text-sm">{editor.mode === "create" ? "初始密码" : "新密码"}</label>
            <Input id="um-password" type="text" autoComplete="off" required minLength={8} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少 8 个字符" />
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">请把密码告知该用户，并提醒其登录后在「账号安全」中修改。</p>
          </div>
        )}

        {editor.mode === "delete" && existing && (
          <div className="space-y-2 text-sm">
            <p>
              将永久删除该账号及其 <strong>{existing.bookCount} 本书</strong>、全部批注、AI 对话和复习卡片。<strong>此操作无法撤销。</strong>
            </p>
            <label htmlFor="um-confirm" className="block">输入该用户的邮箱 <code className="rounded bg-[var(--accent)] px-1">{existing.email}</code> 以确认：</label>
            <Input id="um-confirm" autoComplete="off" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
          </div>
        )}

        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="submit" variant={editor.mode === "delete" ? "destructive" : "default"} disabled={busy || deleteBlocked}>
            {busy ? "处理中…" : editor.mode === "delete" ? "永久删除" : "保存"}
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}
