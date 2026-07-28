// app/backupRestore/history-restore/serviceHistoryRestore.ts

export type HistoryRestoreMode = "today" | "recent7" | "date";

export type HistoryOperation = {
  operation_id: string;
  domain: string;
  action_type: string;
  changed_by_username: string | null;
  changed_by_name: string | null;
  item_count: number;
  description: string | null;
  restored_from_operation_id: string | null;
  restore_reason: string | null;
  created_at: string;
  created_date: string;
  created_time: string;
};

export type HistoryOperationsResponse = {
  ok: true;
  mode: HistoryRestoreMode;
  date: string | null;
  username: string;
  count: number;
  operations: HistoryOperation[];
};

export type HistoryItemStatus =
  | "restorable"
  | "restored"
  | "conflict"
  | "deleted"
  | "already_deleted"
  | "unknown";

export type HistoryOperationItem = {
  id: number;
  operation_id: string;
  unified_id: number | null;
  row_number: number | null;
  column_key: string | null;
  action_type: string;

  before_value: any;
  after_value: any;
  current_value: any;

  before_row_data: Record<string, any> | null;
  after_row_data: Record<string, any> | null;
  current_row_data: Record<string, any> | null;

  status: HistoryItemStatus;
  statusLabel: string;
  restorable: boolean;

  restored_from_item_id: number | null;
  created_at: string;
};

export type HistoryOperationDetailResponse = {
  ok: true;
  operation: HistoryOperation;
  summary: {
    total: number;
    restorable: number;
    restored: number;
    conflict: number;
    deleted: number;
    already_deleted: number;
    unknown: number;
  };
  items: HistoryOperationItem[];
};

export type HistoryRestoreResult = {
  ok: true;
  requestedCount: number;
  loadedCount: number;
  restoredCount: number;
  skippedCount: number;
  restoredItemIds: number[];
  skipped: Array<{
    item_id: number | null;
    unified_id: number | null;
    reason: string;
    message: string;
  }>;
  restoreOperationId: string | null;
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

export async function fetchHistoryOperations(params: {
  mode: HistoryRestoreMode;
  date?: string;
  limit?: number;
}): Promise<HistoryOperationsResponse> {
  const qs = new URLSearchParams();

  qs.set("mode", params.mode);

  if (params.mode === "date" && params.date) {
    qs.set("date", params.date);
  }

  if (params.limit) {
    qs.set("limit", String(params.limit));
  }

  const res = await fetch(
    `/api/backup-restore/history-restore/operations?${qs.toString()}`,
    {
      method: "GET",
      cache: "no-store",
    }
  );

  return readJsonOrThrow(res);
}

export async function fetchHistoryOperationDetail(
  operationId: string
): Promise<HistoryOperationDetailResponse> {
  const safeOperationId = encodeURIComponent(String(operationId ?? "").trim());

  const res = await fetch(
    `/api/backup-restore/history-restore/operations/${safeOperationId}`,
    {
      method: "GET",
      cache: "no-store",
    }
  );

  return readJsonOrThrow(res);
}

export async function restoreHistoryItems(params: {
  itemIds: number[];
  restoreReason?: string;
}): Promise<HistoryRestoreResult> {
  const res = await fetch("/api/backup-restore/history-restore/restore", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({
      itemIds: params.itemIds,
      restoreReason: params.restoreReason ?? "",
    }),
  });

  return readJsonOrThrow(res);
}