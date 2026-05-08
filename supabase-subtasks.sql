-- Subtarefas e novas colunas em `tasks` — executar após `tasks` e `departments`.

CREATE TABLE IF NOT EXISTS subtasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subtasks_task_sort ON subtasks(task_id, sort_order);

ALTER TABLE subtasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all subtasks" ON subtasks;
CREATE POLICY "Allow all subtasks" ON subtasks FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES departments(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status_auto boolean NOT NULL DEFAULT true;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS progress integer NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS viewed_at timestamptz;

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_progress_range;
ALTER TABLE tasks ADD CONSTRAINT tasks_progress_range CHECK (progress >= 0 AND progress <= 100);
