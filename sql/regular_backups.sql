CREATE TABLE IF NOT EXISTS regular_backups (
  id BIGSERIAL PRIMARY KEY,

  backup_kind TEXT NOT NULL DEFAULT 'regular',
  backup_scope TEXT NOT NULL DEFAULT 'postgres_full',

  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL DEFAULT 0,

  status TEXT NOT NULL DEFAULT 'running',
  error_message TEXT,

  created_by_username TEXT,
  created_by_name TEXT,

  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT regular_backups_status_check
    CHECK (status IN ('running', 'success', 'failed')),

  CONSTRAINT regular_backups_file_name_unique
    UNIQUE (file_name),

  CONSTRAINT regular_backups_file_path_unique
    UNIQUE (file_path)
);

CREATE INDEX IF NOT EXISTS regular_backups_created_at_idx
  ON regular_backups (created_at DESC);

CREATE INDEX IF NOT EXISTS regular_backups_status_idx
  ON regular_backups (status);

CREATE INDEX IF NOT EXISTS regular_backups_backup_kind_idx
  ON regular_backups (backup_kind);