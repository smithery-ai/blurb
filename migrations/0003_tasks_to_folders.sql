-- Migrate tasks → folders
ALTER TABLE tasks RENAME TO folders;
ALTER TABLE task_files RENAME TO files;
ALTER TABLE files RENAME COLUMN task_id TO folder_id;

-- Recreate indexes with new names
DROP INDEX IF EXISTS idx_task_files_task;
DROP INDEX IF EXISTS idx_tasks_slug;
DROP INDEX IF EXISTS idx_task_files_path;
CREATE INDEX idx_files_folder ON files(folder_id);
CREATE INDEX idx_folders_slug ON folders(slug);
CREATE UNIQUE INDEX idx_files_path ON files(folder_id, path);
