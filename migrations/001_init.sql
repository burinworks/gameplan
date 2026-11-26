CREATE TABLE projects (
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
  default_executor TEXT NOT NULL DEFAULT 'manual' CHECK (default_executor IN ('manual','ai')),
  labels_json TEXT NOT NULL DEFAULT '[]',
  ord INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE areas (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL,
  color TEXT,
  ord INTEGER NOT NULL DEFAULT 0,
  UNIQUE (project_id, name)
);

CREATE TABLE milestones (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL,
  due TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','active','done')),
  description TEXT,
  ord INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  milestone_id TEXT NOT NULL REFERENCES milestones(id),
  area_id TEXT REFERENCES areas(id),
  title TEXT NOT NULL,
  description TEXT,
  "start" TEXT,
  "end" TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','done','cancelled')),
  priority TEXT NOT NULL DEFAULT 'p2' CHECK (priority IN ('p1','p2','p3')),
  executor TEXT NOT NULL DEFAULT 'manual' CHECK (executor IN ('manual','ai')),
  important INTEGER NOT NULL DEFAULT 0,
  labels_json TEXT NOT NULL DEFAULT '[]',
  ord INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (("start" IS NULL) = ("end" IS NULL))
);
CREATE INDEX tasks_milestone ON tasks(milestone_id);

CREATE TABLE todos (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  done_at TEXT,
  ord INTEGER NOT NULL DEFAULT 0,
  after_json TEXT NOT NULL DEFAULT '[]',
  archived_at TEXT
);
CREATE INDEX todos_task ON todos(task_id);

CREATE TABLE dependencies (
  id TEXT PRIMARY KEY,
  from_task_id TEXT NOT NULL REFERENCES tasks(id),
  to_task_id TEXT REFERENCES tasks(id),
  to_milestone_id TEXT REFERENCES milestones(id),
  created_at TEXT NOT NULL,
  CHECK ((to_task_id IS NULL) <> (to_milestone_id IS NULL))
);
CREATE INDEX deps_from ON dependencies(from_task_id);
CREATE INDEX deps_to_task ON dependencies(to_task_id);

CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  role TEXT NOT NULL CHECK (role IN ('context','deliverable')),
  kind TEXT NOT NULL CHECK (kind IN ('commit','pr','file','link','note')),
  title TEXT,
  url TEXT NOT NULL,
  ref TEXT,
  state TEXT,
  actor TEXT,
  at TEXT NOT NULL,
  archived_at TEXT,
  UNIQUE (task_id, url)
);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  label TEXT,
  actor TEXT NOT NULL,
  kind TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  reason TEXT,
  batch_id TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX events_project_at ON events(project_id, at);
CREATE INDEX events_batch ON events(batch_id);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL
);

CREATE TABLE agent_clients (
  name TEXT PRIMARY KEY,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0
);
