/** Input rules shared by self-service auth and the admin user API. */

export function normalizeEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 255 ? email : null;
}

/** Returns an error message, or null when the password is acceptable. */
export function passwordProblem(value: unknown) {
  const password = String(value ?? "");
  return password.length < 8 || password.length > 128 ? "密码长度必须为 8–128 个字符" : null;
}

export function normalizeName(value: unknown, email: string) {
  return String(value ?? "").trim().slice(0, 100) || email.split("@")[0];
}

/** The only user fields that may ever be sent to a browser. */
export const PUBLIC_USER_FIELDS = {
  id: true,
  email: true,
  name: true,
  role: true,
  disabled: true,
  lastLoginAt: true,
  createdAt: true,
} as const;
