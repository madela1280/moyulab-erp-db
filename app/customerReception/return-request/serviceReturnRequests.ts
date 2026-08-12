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

export function mapReturnRequestApiRow(
  row: ReturnRequestApiRow,
  index: number,
  isListMode: boolean
): ReturnRequestRow {
  const receivedAt = formatDateTime(row.received_at);
  const processStatus = normalizeStatus(row.process_status);
  const matched = row.matched_unified || {};
  const mismatchReason = getMismatchReasonForView(row, isListMode);

  return {
    id: `${receivedAt || "row"}-${normalizeString(row.phone) || "phone"}-${index}`,
    checked: false,
    processStatus,
    receivedAt,
    data: {
      processStatus,
      receivedAt,

      partnerCategory: normalizeString(matched.거래처분류),
      deviceNo: normalizeString(matched.기기번호),

      product: normalizeString(row.return_model),
      recipientName: normalizeString(row.renter_name),
      phone1: normalizeString(row.phone),
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