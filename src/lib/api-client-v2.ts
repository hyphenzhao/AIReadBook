/**
 * API Client v2 — MySQL-backed data access.
 * All functions call the server API instead of localStorage.
 */

let currentUserId = 0;
export function setUserId(id: number) { currentUserId = id; }
export function getUserId() { return currentUserId; }

async function get(path: string) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
async function post(path: string, body: any) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
async function patch(path: string, body: any) {
  const res = await fetch(path, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
async function del(path: string) {
  const res = await fetch(path, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

// --- Auth ---
export async function apiLogin(email: string, password: string) {
  return post("/api/v2/auth", { action: "login", email, password });
}
export async function apiRegister(email: string, password: string, name: string) {
  return post("/api/v2/auth", { action: "register", email, password, name });
}

// --- Books ---
export async function apiGetBooks() {
  return get(`/api/v2/books?userId=${currentUserId}`);
}
export async function apiCreateBook(data: any) {
  return post("/api/v2/books", { userId: currentUserId, ...data });
}
export async function apiDeleteBook(bookId: string) {
  return del(`/api/v2/books/${bookId}`);
}

// --- Annotations ---
export async function apiGetAnnotations() {
  return get(`/api/v2/annotations?userId=${currentUserId}`);
}
export async function apiCreateAnnotation(data: any) {
  return post("/api/v2/annotations", { userId: currentUserId, ...data });
}
export async function apiUpdateAnnotation(id: string, data: any) {
  return patch("/api/v2/annotations", { id, ...data });
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
export async function apiGetUserSettings() {
  return get(`/api/v2/user/settings?userId=${currentUserId}`);
}
export async function apiSaveUserSettings(aiSettings: any) {
  return patch("/api/v2/user/settings", { userId: currentUserId, aiSettings });
}
