export type ExcelBackupItem = {
  id: number;
  backup_scope: string;
  file_name: string;
  file_size_bytes: number;
  status: "running" | "success" | "failed";
  error_message: string | null;
  row_count: number;
  created_by_username: string | null;
  created_by_name: string | null;
  started_at: string;
  finished_at: string | null;
  created_at: string;
};

type ExcelBackupListResponse = {
  ok: boolean;
  backups?: ExcelBackupItem[];
  latestBackup?: ExcelBackupItem | null;
  error?: string;
};

export type ExcelBackupFetchResult = {
  backups: ExcelBackupItem[];
  latestBackup: ExcelBackupItem | null;
};

type ExcelBackupCreateResponse = {
  ok: boolean;
  backup?: ExcelBackupItem;
  error?: string;
};

const BASE_URL = "/api/backup-restore/excel-backups";

async function readJsonSafe<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  return data as T;
}

export async function fetchExcelBackups(): Promise<ExcelBackupFetchResult> {
  const res = await fetch(BASE_URL, {
    method: "GET",
    cache: "no-store",
  });

  const data = await readJsonSafe<ExcelBackupListResponse>(res);

  if (!res.ok || !data.ok) {
    throw new Error(data.error || "excel_backup_list_failed");
  }

  return {
    backups: data.backups || [],
    latestBackup: data.latestBackup || null,
  };
}

export async function createExcelBackup(): Promise<ExcelBackupItem> {
  const res = await fetch(BASE_URL, {
    method: "POST",
    cache: "no-store",
  });

  const data = await readJsonSafe<ExcelBackupCreateResponse>(res);

  if (!res.ok || !data.ok || !data.backup) {
    throw new Error(data.error || "excel_backup_create_failed");
  }

  return data.backup;
}

export function getExcelBackupDownloadUrl(id: number): string {
  return `${BASE_URL}/${encodeURIComponent(String(id))}/download`;
}