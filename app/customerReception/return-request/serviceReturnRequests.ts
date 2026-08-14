import type { ReturnRequestRow } from "@/customerReception/return-request/types";

export type ReturnRequestApiRow = {
  received_at?: string;
  renter_name?: string;
  return_model?: string;
  phone?: string;
  pickup_address?: string;
  pickup_preferred_date?: string;
  return_memo?: string | null;

  mismatch_reason?: string | null;
  original_mismatch_reason?: string | null;
  current_mismatch_reason?: string | null;
  mismatch_resolved_note?: string | null;

  process_status?: string;

  unified_id?: number | null;
  matched_unified?: {
    거래처분류?: string;
    기기번호?: string;
    연락처2?: string;
    택배발송일?: string;
    시작일?: string;
    종료일?: string;
    특이사항1?: string;
    특이사항2?: string;
    반납요청일?: string;
    반납완료일?: string;
  } | null;
};

export type FetchReturnRequestsParams = {
  status?: string;
};

export type SubmitReturnRequestResult = {
  ok: boolean;
  message?: string;
  successCount?: number;
  failedRows?: Array<{
    id?: string;
    unifiedId?: number | null;
    receivedAt?: string;
    phone?: string;
    renterName?: string;
    returnModel?: string;
    message?: string;
  }>;
  statusResult?: any;
};

const WEB_CELL_FIELD_MAP: Record<string, string> = {
  product: "return_model",
  recipientName: "renter_name",
  phone1: "phone",
  contractAddress: "pickup_address",
  returnRequestDate: "pickup_preferred_date",
  returnMemo: "return_memo",
};

function normalizeString(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeStatus(value: unknown): "접수중" | "전송" | "삭제" {
  const s = normalizeString(value);
  if (s === "전송" || s === "삭제") return s;
  return "접수중";
}

function formatDateTime(value: unknown) {
  const raw = normalizeString(value);
  if (!raw) return "";

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function formatDate(value: unknown) {
  const raw = normalizeString(value);
  if (!raw) return "";

  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.slice(0, 10);
  }

  return raw;
}

function getMismatchReasonForView(row: ReturnRequestApiRow, isListMode: boolean) {
  if (isListMode) {
    return normalizeString(row.original_mismatch_reason);
  }

  return normalizeString(row.current_mismatch_reason);
}

function isRealRow(row: ReturnRequestRow) {
  return !!row?.id && !String(row.id).startsWith("empty-");
}

export function mapReturnRequestApiRow(
  row: ReturnRequestApiRow,
  index: number,
  isListMode: boolean
): ReturnRequestRow {
  const receivedAtRaw = normalizeString(row.received_at);
  const receivedAt = formatDateTime(row.received_at);
  const processStatus = normalizeStatus(row.process_status);
  const matched = row.matched_unified || {};
  const mismatchReason = getMismatchReasonForView(row, isListMode);

  const renterName = normalizeString(row.renter_name);
  const returnModel = normalizeString(row.return_model);
  const phone = normalizeString(row.phone);

  return {
    id: `${receivedAtRaw || receivedAt || "row"}-${phone || "phone"}-${index}`,
    checked: false,
    processStatus,
    receivedAt,
    data: {
      processStatus,
      receivedAt,

      partnerCategory: normalizeString(matched.거래처분류),
      deviceNo: normalizeString(matched.기기번호),

      product: returnModel,
      recipientName: renterName,
      phone1: phone,
      phone2: normalizeString(matched.연락처2),
      contractAddress: normalizeString(row.pickup_address),

      shippingDate: normalizeString(matched.택배발송일),
      startDate: normalizeString(matched.시작일),
      endDate: normalizeString(matched.종료일),
      returnRequestDate: formatDate(row.pickup_preferred_date),
      specialNote1: normalizeString(matched.특이사항1),
      specialNote2: normalizeString(matched.특이사항2),

      returnMemo: normalizeString(row.return_memo),
      mismatchReason,
      mismatchResolvedNote: isListMode ? normalizeString(row.mismatch_resolved_note) : "",

      unifiedId: row.unified_id ? String(row.unified_id) : "",
      currentUnifiedReturnRequestDate: normalizeString(matched.반납요청일),

      __receivedAtRaw: receivedAtRaw,
      __phoneRaw: phone,
      __renterNameRaw: renterName,
      __returnModelRaw: returnModel,
    },
  };
}

export async function fetchReturnRequests(params: FetchReturnRequestsParams = {}) {
  const sp = new URLSearchParams();

  if (params.status) {
    sp.set("status", params.status);
  }

  const url = `/api/customer-reception/return-requests${sp.toString() ? `?${sp.toString()}` : ""}`;

  const r = await fetch(url, {
    method: "GET",
    cache: "no-store",
  });

  const j = await r.json().catch(() => null);

  if (!r.ok) {
    throw new Error(j?.message || `FAILED(${r.status})`);
  }

  const rawRows = Array.isArray(j?.rows) ? j.rows : [];
  const isListMode = !params.status;

  return rawRows.map((row: ReturnRequestApiRow, index: number) =>
    mapReturnRequestApiRow(row, index, isListMode)
  );
}

export async function updateReturnRequestWebCell(
  row: ReturnRequestRow,
  colKey: string,
  value: string
) {
  const field = WEB_CELL_FIELD_MAP[colKey];

  if (!field) {
    throw new Error("수정할 수 없는 컬럼입니다.");
  }

  const receivedAt = normalizeString(row.data?.__receivedAtRaw || row.receivedAt);
  const phone = normalizeString(row.data?.__phoneRaw || row.data?.phone1);
  const renterName = normalizeString(row.data?.__renterNameRaw || row.data?.recipientName);
  const returnModel = normalizeString(row.data?.__returnModelRaw || row.data?.product);

  if (!receivedAt || !phone || !renterName || !returnModel) {
    throw new Error("수정 대상 반납접수 행을 찾을 수 없습니다.");
  }

  const r = await fetch("/api/customer-reception/return-requests", {
    method: "PATCH",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      received_at: receivedAt,
      phone,
      renter_name: renterName,
      return_model: returnModel,
      field,
      value,
    }),
  });

  const j = await r.json().catch(() => null);

  if (!r.ok || j?.ok === false) {
    throw new Error(j?.message || `FAILED(${r.status})`);
  }

  return j;
}

export async function submitReturnRequestRows(
  rows: ReturnRequestRow[]
): Promise<SubmitReturnRequestResult> {
  const targetRows = (Array.isArray(rows) ? rows : []).filter(isRealRow);

  if (!targetRows.length) {
    return {
      ok: false,
      message: "전송할 행이 없습니다.",
      successCount: 0,
      failedRows: [],
    };
  }

  const r = await fetch("/api/customer-reception/return-requests/submit", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      rows: targetRows,
    }),
  });

  const j = (await r.json().catch(() => null)) as SubmitReturnRequestResult | null;

  if (!r.ok || j?.ok === false) {
    return {
      ok: false,
      message: j?.message || `FAILED(${r.status})`,
      successCount: j?.successCount || 0,
      failedRows: Array.isArray(j?.failedRows) ? j.failedRows : [],
      statusResult: j?.statusResult,
    };
  }

  return {
    ok: true,
    message: j?.message || "전송이 완료되었습니다.",
    successCount: j?.successCount || targetRows.length,
    failedRows: Array.isArray(j?.failedRows) ? j.failedRows : [],
    statusResult: j?.statusResult,
  };
}