CREATE TABLE IF NOT EXISTS excel_backups (
  id BIGSERIAL PRIMARY KEY,

  backup_scope TEXT NOT NULL DEFAULT 'unified_excel',

  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL DEFAULT 0,

  status TEXT NOT NULL DEFAULT 'running',
  error_message TEXT,

  row_count BIGINT NOT NULL DEFAULT 0,

  created_by_username TEXT,
  created_by_name TEXT,

  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT excel_backups_status_check
    CHECK (status IN ('running', 'success', 'failed')),

  CONSTRAINT excel_backups_file_name_unique
    UNIQUE (file_name),

  CONSTRAINT excel_backups_file_path_unique
    UNIQUE (file_path)
);

CREATE INDEX IF NOT EXISTS excel_backups_created_at_idx
  ON excel_backups (created_at DESC);

CREATE INDEX IF NOT EXISTS excel_backups_status_idx
  ON excel_backups (status);

CREATE INDEX IF NOT EXISTS excel_backups_backup_scope_idx
  ON excel_backups (backup_scope);