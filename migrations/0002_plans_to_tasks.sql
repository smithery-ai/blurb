-- Migrate plans → tasks
ALTER TABLE plans RENAME TO tasks;
ALTER TABLE plan_files RENAME TO task_files;
ALTER TABLE task_files RENAME COLUMN plan_id TO task_id;
ALTER TABLE task_files RENAME COLUMN filename TO path;

-- Recreate indexes with new names
DROP INDEX IF EXISTS idx_plan_files_plan;
DROP INDEX IF EXISTS idx_plans_slug;
CREATE INDEX idx_task_files_task ON task_files(task_id);
CREATE INDEX idx_tasks_slug ON tasks(slug);
CREATE UNIQUE INDEX idx_task_files_path ON task_files(task_id, path);
