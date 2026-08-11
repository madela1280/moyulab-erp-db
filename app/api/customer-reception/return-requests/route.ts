import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

const DEFAULT_CS_BASE_URL = "https://return.moulab.kr";

function getCsBaseUrl() {
  return String(process.env.CS_SERVER_BASE_URL || DEFAULT_CS_BASE_URL).replace(/\/+$/, "");
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
  const reasons: string[] = [];

  if (!isSameText(requestRow?.renter_name, unifiedData["수취인명"])) {
    reasons.push("대여자명/수취인명 불일치");
  }

  if (!isSamePhone(requestRow?.phone, unifiedData["연락처1"])) {
    reasons.push("전화번호/연락처1 불일치");
  }

  if (!isSameText(requestRow?.return_model, unifiedData["제품"])) {
    reasons.push("반납기종/제품 불일치");
  }

  if (!isSameText(requestRow?.pickup_address, unifiedData["계약자주소"])) {
    reasons.push("수거주소/계약자주소 불일치");
  }

  return reasons.join(", ");
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

function mapWithUnifiedMatch(requestRow: any, unifiedRows: any[]) {
  const matched = findBestUnifiedMatch(requestRow, unifiedRows);

  if (!matched) {
    return {
      ...requestRow,
      unified_id: null,
      matched_unified: null,
      mismatch_reason: normalizeString(requestRow?.mismatch_reason) || "통합관리 매칭 없음",
    };
  }

  const data = matched.data && typeof matched.data === "object" ? matched.data : {};
  const mismatchReason = buildMismatchReason(requestRow, data);

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
    },
    mismatch_reason: normalizeString(requestRow?.mismatch_reason) || mismatchReason,
  };
}

async function fetchCustomerServerRows(status: string) {
  const targetUrl = new URL(`${getCsBaseUrl()}/api/erp/return-requests`);

  if (status) {
    targetUrl.searchParams.set("status", status);
  }

  const response = await fetch(targetUrl.toString(), {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
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

    const [requestRows, unifiedRows] = await Promise.all([
      fetchCustomerServerRows(status),
      fetchUnifiedRows(),
    ]);

    const rows = requestRows.map((row: any) => mapWithUnifiedMatch(row, unifiedRows));

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