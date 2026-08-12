import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

const DEFAULT_CS_BASE_URL = "https://return.moulab.kr";

function getCsBaseUrl() {
  return String(process.env.CS_SERVER_BASE_URL || DEFAULT_CS_BASE_URL).replace(/\/+$/, "");
}

function getCsApiHeaders(extra?: Record<string, string>) {
  const apiKey = String(
    process.env.CS_SERVER_API_KEY ||
      process.env.CS_ERP_API_KEY ||
      process.env.ERP_API_KEY ||
      ""
  ).trim();

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(extra || {}),
  };

  if (apiKey) {
    headers["x-erp-api-key"] = apiKey;
  }

  return headers;
}

function normalizeString(value: unknown) {
  return String(value ?? "").trim();
}

function normalizePhone(value: unknown) {
  return normalizeString(value).replace(/\D/g, "");
}

function normalizeText(value: unknown) {
  return normalizeString(value).replace(/\s+/g, "").toLowerCase();
}

function isSameText(a: unknown, b: unknown) {
  const aa = normalizeText(a);
  const bb = normalizeText(b);
  if (!aa || !bb) return false;
  return aa === bb;
}

function isSamePhone(a: unknown, b: unknown) {
  const aa = normalizePhone(a);
  const bb = normalizePhone(b);
  if (!aa || !bb) return false;
  return aa === bb;
}

function buildMismatchReason(requestRow: any, unifiedData: Record<string, any>) {
  const returnRequestDate = normalizeString(unifiedData["반납요청일"]);
  const returnCompleteDate = normalizeString(unifiedData["반납완료일"]);

  const reasons: string[] = [];

  if (returnRequestDate || returnCompleteDate) {
    reasons.push("반납완료일 접수 확인");
  }

  if (!isSameText(requestRow?.renter_name, unifiedData["수취인명"])) {
    reasons.push("수취인명 불일치");
  }

  if (!isSamePhone(requestRow?.phone, unifiedData["연락처1"])) {
    reasons.push("연락처불일치");
  }

  if (!isSameText(requestRow?.return_model, unifiedData["제품"])) {
    reasons.push("제품명 불일치");
  }

  if (!isSameText(requestRow?.pickup_address, unifiedData["계약자주소"])) {
    reasons.push("계약자주소 불일치");
  }

  return reasons.join(", ");
}

function buildMismatchResolvedNote(originalReason: string, currentReason: string) {
  const original = normalizeString(originalReason);
  const current = normalizeString(currentReason);

  if (!original) return "";
  if (!current) return "모두 수정됨";
  if (original !== current) return "일부 수정됨";

  return "";
}

function findBestUnifiedMatch(requestRow: any, unifiedRows: any[]) {
  const requestPhone = requestRow?.phone;
  const requestName = requestRow?.renter_name;
  const requestProduct = requestRow?.return_model;

  const phoneMatches = unifiedRows.filter((row) => isSamePhone(requestPhone, row.data?.["연락처1"]));

  if (phoneMatches.length === 1) {
    return phoneMatches[0];
  }

  if (phoneMatches.length > 1) {
    const nameAndProduct = phoneMatches.find(
      (row) =>
        isSameText(requestName, row.data?.["수취인명"]) &&
        isSameText(requestProduct, row.data?.["제품"])
    );

    if (nameAndProduct) return nameAndProduct;

    const nameOnly = phoneMatches.find((row) => isSameText(requestName, row.data?.["수취인명"]));
    if (nameOnly) return nameOnly;

    return phoneMatches[0];
  }

  const nameAndProduct = unifiedRows.find(
    (row) =>
      isSameText(requestName, row.data?.["수취인명"]) &&
      isSameText(requestProduct, row.data?.["제품"])
  );

  if (nameAndProduct) return nameAndProduct;

  return null;
}

function getCurrentMismatchReason(requestRow: any, unifiedRows: any[]) {
  const matched = findBestUnifiedMatch(requestRow, unifiedRows);

  if (!matched) {
    return "통합관리 매칭 없음";
  }

  const data = matched.data && typeof matched.data === "object" ? matched.data : {};
  return buildMismatchReason(requestRow, data);
}

function mapWithUnifiedMatch(requestRow: any, unifiedRows: any[], isListMode: boolean) {
  const matched = findBestUnifiedMatch(requestRow, unifiedRows);
  const savedOriginalMismatchReason = normalizeString(requestRow?.mismatch_reason);

  if (!matched) {
    const currentMismatchReason = "통합관리 매칭 없음";
    const originalMismatchReason = savedOriginalMismatchReason || currentMismatchReason;

    return {
      ...requestRow,
      unified_id: null,
      matched_unified: null,

      mismatch_reason: isListMode ? originalMismatchReason : currentMismatchReason,
      original_mismatch_reason: originalMismatchReason,
      current_mismatch_reason: currentMismatchReason,
      mismatch_resolved_note: buildMismatchResolvedNote(
        originalMismatchReason,
        currentMismatchReason
      ),
    };
  }

  const data = matched.data && typeof matched.data === "object" ? matched.data : {};
  const currentMismatchReason = buildMismatchReason(requestRow, data);
  const originalMismatchReason = savedOriginalMismatchReason || currentMismatchReason;

  return {
    ...requestRow,
    unified_id: matched.id,
    matched_unified: {
      거래처분류: normalizeString(data["거래처분류"]),
      기기번호: normalizeString(data["기기번호"]),
      연락처2: normalizeString(data["연락처2"]),
      택배발송일: normalizeString(data["택배발송일"]),
      시작일: normalizeString(data["시작일"]),
      종료일: normalizeString(data["종료일"]),
      특이사항1: normalizeString(data["특이사항1"]),
      특이사항2: normalizeString(data["특이사항2"]),
      반납요청일: normalizeString(data["반납요청일"]),
      반납완료일: normalizeString(data["반납완료일"]),
    },

    mismatch_reason: isListMode ? originalMismatchReason : currentMismatchReason,
    original_mismatch_reason: originalMismatchReason,
    current_mismatch_reason: currentMismatchReason,
    mismatch_resolved_note: buildMismatchResolvedNote(originalMismatchReason, currentMismatchReason),
  };
}

function buildCustomerServerIdentityItem(row: any) {
  return {
    received_at: normalizeString(row?.received_at),
    phone: normalizeString(row?.phone),
    renter_name: normalizeString(row?.renter_name),
    return_model: normalizeString(row?.return_model),
  };
}

async function saveInitialMismatchReasons(requestRows: any[], unifiedRows: any[]) {
  const items = requestRows
    .map((row) => {
      const savedOriginal = normalizeString(row?.mismatch_reason);
      const currentReason = getCurrentMismatchReason(row, unifiedRows);

      if (savedOriginal || !currentReason) return null;

      return {
        ...buildCustomerServerIdentityItem(row),
        mismatch_reason: currentReason,
      };
    })
    .filter((item) => {
      if (!item) return false;
      return item.received_at && item.phone && item.renter_name && item.return_model;
    });

  if (!items.length) return;

  const targetUrl = `${getCsBaseUrl()}/api/erp/return-requests/mismatch-reason`;

  const response = await fetch(targetUrl, {
    method: "POST",
    cache: "no-store",
    headers: getCsApiHeaders({
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({ items }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || `고객접수 서버 불일치사유 저장 실패(${response.status})`);
  }
}

async function fetchCustomerServerRows(status: string) {
  const targetUrl = new URL(`${getCsBaseUrl()}/api/erp/return-requests`);

  if (status) {
    targetUrl.searchParams.set("status", status);
  }

  const response = await fetch(targetUrl.toString(), {
    method: "GET",
    cache: "no-store",
    headers: getCsApiHeaders(),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || `고객접수 서버 조회 실패(${response.status})`);
  }

  return Array.isArray(data?.rows) ? data.rows : Array.isArray(data) ? data : [];
}

async function fetchUnifiedRows() {
  const result = await query(`
    SELECT id, data
    FROM unified
    ORDER BY id DESC
  `);

  return Array.isArray((result as any)?.rows) ? (result as any).rows : [];
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const status = String(url.searchParams.get("status") || "").trim();
    const isListMode = !status;

    const [requestRows, unifiedRows] = await Promise.all([
      fetchCustomerServerRows(status),
      fetchUnifiedRows(),
    ]);

    try {
      await saveInitialMismatchReasons(requestRows, unifiedRows);
    } catch (err) {
      console.warn("return request initial mismatch reason save failed (ignored):", err);
    }

    const rows = requestRows.map((row: any) => mapWithUnifiedMatch(row, unifiedRows, isListMode));

    return NextResponse.json({
      ok: true,
      rows,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        message: e?.message || "반납접수 데이터를 불러오지 못했습니다.",
        rows: [],
      },
      { status: 500 }
    );
  }
}