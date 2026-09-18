-- Run after every `prisma db push` (see deploy/deploy.sh). Every statement
-- must be safe to repeat.

-- An instance always needs an admin: if there is none, promote the oldest
-- account. This is what turns the original single user into the admin.
UPDATE users
SET role = 'ADMIN'
WHERE id = (SELECT id FROM (SELECT MIN(id) AS id FROM users) AS first_user)
  AND NOT EXISTS (SELECT 1 FROM (SELECT id FROM users WHERE role = 'ADMIN') AS admins);
