/**
 * The signing secret must be its own value. It used to fall back to
 * DATABASE_URL, which meant any change to the connection string silently
 * logged every user out.
 */
export function authSecret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 16) {
    throw new Error("AUTH_SECRET is required (at least 16 characters)");
  }
  return value;
}
