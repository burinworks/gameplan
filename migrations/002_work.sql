-- gameplan: foreign_keys=off
-- Review status, "together" executor, resume notes, ticket attachments, day plan, inbox.
-- SQLite can't alter CHECK constraints, so projects, tasks and attachments are rebuilt.

CREATE TABLE projects_new (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  color TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','done','dropped')),
  status_changed_at TEXT,
  vault_note TEXT,
  repo TEXT,
  github TEXT,
  default_priority TEXT NOT NULL DEFAULT 'p2' CHECK (default_priority IN ('p1','p2','p3')),
  default_executor TEXT NOT NULL DEFAULT 'manual' CHECK (default_executor IN ('manual','ai','together')),
  labels_json TEXT NOT NULL DEFAULT '[]',
  ord INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at TEXT NOT NULL
);
INSERT INTO projects_new SELECT id, slug, name, color, status, status_changed_at, vault_note, repo, github, default_priority, default_executor, labels_json, ord, archived_at, created_at FROM projects;
DROP TABLE projects;
ALTER TABLE projects_new RENAME TO projects;

CREATE TABLE tasks_new (
  id TEXT PRIMARY KEY,
  milestone_id TEXT NOT NULL REFERENCES milestones(id),
  area_id TEXT REFERENCES areas(id),
  title TEXT NOT NULL,
  description TEXT,
  "start" TEXT,
  "end" TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','review','done','cancelled')),
  priority TEXT NOT NULL DEFAULT 'p2' CHECK (priority IN ('p1','p2','p3')),
  executor TEXT NOT NULL DEFAULT 'manual' CHECK (executor IN ('manual','ai','together')),
  important INTEGER NOT NULL DEFAULT 0,
  labels_json TEXT NOT NULL DEFAULT '[]',
  ord INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resume_note TEXT,
  resume_at TEXT,
  resume_by TEXT,
  CHECK (("start" IS NULL) = ("end" IS NULL))
);
INSERT INTO tasks_new (id, milestone_id, area_id, title, description, "start", "end", status, priority, executor, important, labels_json, ord, archived_at, created_at, updated_at)
  SELECT id, milestone_id, area_id, title, description, "start", "end", status, priority, executor, important, labels_json, ord, archived_at, created_at, updated_at FROM tasks;
DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;
CREATE INDEX tasks_milestone ON tasks(milestone_id);

CREATE TABLE attachments_new (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  role TEXT NOT NULL CHECK (role IN ('context','deliverable')),
  kind TEXT NOT NULL CHECK (kind IN ('commit','pr','file','link','note','ticket')),
  title TEXT,
  url TEXT NOT NULL,
  ref TEXT,
  state TEXT,
  actor TEXT,
  at TEXT NOT NULL,
  archived_at TEXT,
  UNIQUE (task_id, url)
);
INSERT INTO attachments_new SELECT id, task_id, role, kind, title, url, ref, state, actor, at, archived_at FROM attachments;
DROP TABLE attachments;
ALTER TABLE attachments_new RENAME TO attachments;

CREATE TABLE day_plan_items (
  date TEXT NOT NULL,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  ord INTEGER NOT NULL,
  when_text TEXT,
  PRIMARY KEY (date, task_id)
);

CREATE TABLE inbox_items (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL,
  triaged_at TEXT,
  triaged_to_json TEXT,
  archived_at TEXT
);
