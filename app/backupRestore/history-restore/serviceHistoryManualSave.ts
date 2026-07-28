// app/backupRestore/history-restore/serviceHistoryManualSave.ts

export type HistoryManualSaveUpdate = {
  unified_id: number;
  column_key: string;
  before_value: any;
  expected_current_value: any;
  next_value: any;
};

export type HistoryManualSaveDelete = {
  unified_id: number;
  expected_row_data: Record<string, any>;
};

export type HistoryManualSaveInsert = {
  after_row_key: string | null;
  data: Record<string, any>;
};

export type HistoryManualSavePayload = {
  operationId: string;
  updates: HistoryManualSaveUpdate[];
  deletes: HistoryManualSaveDelete[];
  inserts: HistoryManualSaveInsert[];
};

export type HistoryManualSaveResult = {
  ok: true;
  requestedUpdateCount: number;
  requestedDeleteCount: number;
  requestedInsertCount: number;

  updatedCount: number;
  deletedCount: number;
  insertedCount: number;
  skippedCount: number;

  skipped: Array<{
    type: "update" | "delete" | "insert";
    unified_id: number | null;
    column_key?: string | null;
    reason: string;
    message: string;
  }>;

  operationId: string | null;
};

async function readJsonOrThrow(res: Response) {
  let data: any = null;

  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const message =
      data?.message ||
      data?.error ||
      `요청 실패 (${res.status})`;

    throw new Error(message);
  }

  return data;
}

export async function saveHistoryManualChanges(
  payload: HistoryManualSavePayload
): Promise<HistoryManualSaveResult> {
  const res = await fetch("/api/backup-restore/history-restore/manual-save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify(payload),
  });

  return readJsonOrThrow(res);
}