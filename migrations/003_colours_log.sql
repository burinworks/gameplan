-- Milestone colours and the per-task execution log (replaces the single resume note).

ALTER TABLE milestones ADD COLUMN color TEXT;

-- Existing milestones take the palette in order within their project.
UPDATE milestones SET color = CASE (
  SELECT count(*) FROM milestones m2
  WHERE m2.project_id = milestones.project_id
    AND (m2.ord < milestones.ord OR (m2.ord = milestones.ord AND m2.rowid < milestones.rowid))
) % 8
  WHEN 0 THEN '#6E7CF5'
  WHEN 1 THEN '#D9892B'
  WHEN 2 THEN '#3FA796'
  WHEN 3 THEN '#B66AD0'
  WHEN 4 THEN '#7A8B99'
  WHEN 5 THEN '#E07A5F'
  WHEN 6 THEN '#4E9BD6'
  ELSE '#9AA24A'
END;

CREATE TABLE task_log (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  text TEXT NOT NULL,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL,
  edited_at TEXT,
  deleted_at TEXT
);
CREATE INDEX task_log_task ON task_log(task_id, created_at);

-- One entry from each existing resume note.
INSERT INTO task_log(id, task_id, text, actor, created_at)
  SELECT 'lg_' || id, id, resume_note, COALESCE(resume_by, 'you'), COALESCE(resume_at, updated_at)
  FROM tasks WHERE resume_note IS NOT NULL AND trim(resume_note) <> '';
