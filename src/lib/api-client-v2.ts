/**
 * API Client v2 — MySQL-backed data access.
 * All functions call the server API instead of localStorage.
 */

let currentUserId = 0;
export function setUserId(id: number) { currentUserId = id; }
export function getUserId() { return currentUserId; }

/** A failed API call. `status` is 0 when the request never reached the server. */
export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "ApiError";
  }
  get isAuth() { return this.status === 401; }
  get isUnavailable() { return this.status === 0 || this.status >= 500; }
}

/** Message fit for showing to the user, whatever was thrown. */
export function errorMessage(error: unknown, fallback = "操作失败，请稍后重试") {
  return error instanceof ApiError ? error.message : fallback;
}

// Set by the session bootstrap; called when an authenticated request gets a
// 401, i.e. the session expired while the app was open.
let onSessionExpired: (() => void) | null = null;
export function setSessionExpiredHandler(handler: (() => void) | null) { onSessionExpired = handler; }

interface RequestOptions { body?: unknown; expectAuth?: boolean }

async function request(method: string, path: string, { body, expectAuth = true }: RequestOptions = {}) {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("无法连接服务器，请检查网络", 0);
  }
  if (res.ok) return res.status === 204 ? null : res.json().catch(() => null);

  const data = await res.json().catch(() => null);
  const message = typeof data?.error === "string" && data.error
    ? data.error
    : res.status >= 500 ? "服务暂时不可用，请稍后重试" : `请求失败 (${res.status})`;
  if (res.status === 401 && expectAuth) onSessionExpired?.();
  throw new ApiError(message, res.status);
}

const get = (path: string, options?: RequestOptions) => request("GET", path, options);
const post = (path: string, body: unknown, options?: RequestOptions) => request("POST", path, { ...options, body });
const patch = (path: string, body: unknown) => request("PATCH", path, { body });
const del = (path: string, body?: unknown) => request("DELETE", path, { body });

// --- Auth ---
// A 401 from these means "wrong credentials" / "not logged in", not an
// expired session, so they opt out of the global handler.
export async function apiLogin(email: string, password: string) {
  return post("/api/v2/auth", { action: "login", email, password }, { expectAuth: false });
}
export async function apiRegister(email: string, password: string, name: string) {
  return post("/api/v2/auth", { action: "register", email, password, name }, { expectAuth: false });
}
export async function apiGetSession() {
  return get("/api/v2/auth", { expectAuth: false });
}
export async function apiLogout() {
  return post("/api/v2/auth", { action: "logout" }, { expectAuth: false });
}
export async function apiChangePassword(oldPassword: string, newPassword: string) {
  return post("/api/v2/auth", { action: "changePassword", oldPassword, newPassword }, { expectAuth: false });
}

// --- Books ---
export async function apiGetBooks() {
  return get("/api/v2/books");
}
export async function apiCreateBook(data: any) {
  return post("/api/v2/books", { userId: currentUserId, ...data });
}
export async function apiDeleteBook(bookId: string) {
  return del(`/api/v2/books/${bookId}`);
}
export async function apiUpdateBook(bookId: string, data: any) {
  return patch(`/api/v2/books/${bookId}`, data);
}

// --- Annotations ---
export async function apiGetAnnotations() {
  return get("/api/v2/annotations");
}
export async function apiCreateAnnotation(data: any) {
  return post("/api/v2/annotations", { userId: currentUserId, ...data });
}
export async function apiUpdateAnnotation(id: string, data: any) {
  return patch("/api/v2/annotations", { id, ...data });
}
export async function apiDeleteAnnotation(id: string) {
  await del("/api/v2/annotations", { id });
}

// --- Chat ---
export async function apiGetChatSessions(bookId: string) {
  return get(`/api/v2/chat?bookId=${bookId}`);
}
export async function apiCreateChatSession(data: any) {
  return post("/api/v2/chat", data);
}
export async function apiDeleteChatSession(id: string) {
  return del(`/api/v2/chat/${id}`);
}
export async function apiAddChatMessage(sessionId: string, role: string, content: string) {
  return post(`/api/v2/chat/${sessionId}/messages`, { role, content });
}

// --- User Settings ---
/** What the server returns: the key itself never leaves the server. */
export interface AISettingsView {
  /** True when a chat request would find usable credentials. */
  ready: boolean;
  hasKey: boolean;
  keyHint: string;
  /** True when no personal key is set but the server has a shared fallback key. */
  serverKeyAvailable: boolean;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
}
/** `apiKey`: omit to keep the stored key, "" to clear it, a value to replace it. */
export interface AISettingsPatch {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export async function apiGetUserSettings(): Promise<{ aiSettings: AISettingsView }> {
  return get("/api/v2/user/settings");
}
export async function apiSaveUserSettings(aiSettings: AISettingsPatch): Promise<{ aiSettings: AISettingsView }> {
  return patch("/api/v2/user/settings", { aiSettings });
}
export async function apiSaveUserName(name: string) {
  return patch("/api/v2/user/settings", { name });
}
/** Lists the provider's models. Unsaved form values may be passed to test them. */
export async function apiListModels(draft?: { apiKey?: string; baseUrl?: string }): Promise<{ models: string[] }> {
  return post("/api/v2/ai/models", draft ?? {});
}
