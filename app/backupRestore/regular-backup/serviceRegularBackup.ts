export type RegularBackupItem = {
  id: number;
  backup_kind: string;
  backup_scope: string;
  file_name: string;
  file_size_bytes: number;
  status: "running" | "success" | "failed";
  error_message: string | null;
  created_by_username: string | null;
  created_by_name: string | null;
  started_at: string;
  finished_at: string | null;
  created_at: string;
};

type RegularBackupListResponse = {
  ok: boolean;
  backups?: RegularBackupItem[];
  error?: string;
};

type RegularBackupCreateResponse = {
  ok: boolean;
  backup?: RegularBackupItem;
  error?: string;
};

type RegularBackupDeleteResponse = {
  ok: boolean;
  error?: string;
};

type RegularBackupRestoreResponse = {
  ok: boolean;
  restoredBackupId?: number;
  error?: string;
  detail?: string;
  requiredConfirmText?: string;
  requiredBusinessHourConfirm?: string;
};

const BASE_URL = "/api/backup-restore/regular-backups";

async function readJsonSafe<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  return data as T;
}

export async function fetchRegularBackups(): Promise<RegularBackupItem[]> {
  const res = await fetch(BASE_URL, {
    method: "GET",
    cache: "no-store",
  });

  const data = await readJsonSafe<RegularBackupListResponse>(res);

  if (!res.ok || !data.ok) {
    throw new Error(data.error || "backup_list_failed");
  }

  return data.backups || [];
}

export async function createRegularBackup(): Promise<RegularBackupItem> {
  const res = await fetch(BASE_URL, {
    method: "POST",
    cache: "no-store",
  });

  const data = await readJsonSafe<RegularBackupCreateResponse>(res);

  if (!res.ok || !data.ok || !data.backup) {
    throw new Error(data.error || "backup_create_failed");
  }

  return data.backup;
}

export async function deleteRegularBackup(id: number): Promise<void> {
  const res = await fetch(`${BASE_URL}/${encodeURIComponent(String(id))}`, {
    method: "DELETE",
    cache: "no-store",
  });

  const data = await readJsonSafe<RegularBackupDeleteResponse>(res);

  if (!res.ok || !data.ok) {
    throw new Error(data.error || "backup_delete_failed");
  }
}

export async function restoreRegularBackup(params: {
  id: number;
  confirmText?: string;
  businessHourConfirm?: string;
  adminPassword?: string;
  restoreReason?: string;
}): Promise<void> {
  const res = await fetch(
    `${BASE_URL}/${encodeURIComponent(String(params.id))}/restore`,
    {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        confirmText: params.confirmText || "",
        businessHourConfirm: params.businessHourConfirm || "",
        adminPassword: params.adminPassword || "",
        restoreReason: params.restoreReason || "",
      }),
    }
  );

  const data = await readJsonSafe<RegularBackupRestoreResponse>(res);

  if (!res.ok || !data.ok) {
    const detail = data.detail ? `: ${data.detail}` : "";
    throw new Error((data.error || "backup_restore_failed") + detail);
  }
}

  const data = await readJsonSafe<RegularBackupRestoreResponse>(res);

  if (!res.ok || !data.ok) {
    const detail = data.detail ? `: ${data.detail}` : "";
    throw new Error((data.error || "backup_restore_failed") + detail);
  }
}

export function getRegularBackupDownloadUrl(id: number): string {
  return `${BASE_URL}/${encodeURIComponent(String(id))}/download`;
}