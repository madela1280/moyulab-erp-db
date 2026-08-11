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
  process_status?: string;
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

export function mapReturnRequestApiRow(row: ReturnRequestApiRow, index: number): ReturnRequestRow {
  const receivedAt = formatDateTime(row.received_at);
  const processStatus = normalizeStatus(row.process_status);

  return {
    id: `${receivedAt || "row"}-${index}`,
    checked: false,
    processStatus,
    receivedAt,
    data: {
      processStatus,
      receivedAt,
      partnerCategory: "",
      deviceNo: "",
      product: normalizeString(row.return_model),
      recipientName: normalizeString(row.renter_name),
      phone1: normalizeString(row.phone),
      phone2: "",
      contractAddress: normalizeString(row.pickup_address),
      shippingDate: "",
      startDate: "",
      endDate: "",
      returnRequestDate: formatDate(row.pickup_preferred_date),
      specialNote1: "",
      specialNote2: "",
      returnMemo: normalizeString(row.return_memo),
      mismatchReason: normalizeString(row.mismatch_reason),
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

  return rawRows.map((row: ReturnRequestApiRow, index: number) =>
    mapReturnRequestApiRow(row, index)
  );
}