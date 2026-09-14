ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS extra_roles text[] NOT NULL DEFAULT '{}';
