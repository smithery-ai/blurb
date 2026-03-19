CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE plan_files (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES plans(id),
  filename TEXT NOT NULL,
  content TEXT NOT NULL,
  language TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL REFERENCES plan_files(id),
  anchor_json TEXT NOT NULL,
  body TEXT NOT NULL,
  author TEXT DEFAULT 'Anonymous',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE replies (
  id TEXT PRIMARY KEY,
  comment_id TEXT NOT NULL REFERENCES comments(id),
  body TEXT NOT NULL,
  author TEXT DEFAULT 'Anonymous',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_plan_files_plan ON plan_files(plan_id);
CREATE INDEX idx_comments_file ON comments(file_id);
CREATE INDEX idx_replies_comment ON replies(comment_id);
CREATE INDEX idx_plans_slug ON plans(slug);
