CREATE TABLE IF NOT EXISTS user_preferences (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  scope text NOT NULL,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, scope)
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_user_scope ON user_preferences(user_id, scope);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all user_preferences" ON user_preferences
  FOR ALL USING (true) WITH CHECK (true);
