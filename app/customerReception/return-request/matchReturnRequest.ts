import type { ReturnRequestRow } from "@/customerReception/return-request/types";

export type UnifiedMatchSourceRow = {
  id: number;
  data: Record<string, any>;
};

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

function getRequestValue(row: ReturnRequestRow, key: string) {
  return normalizeString(row.data?.[key]);
}

function buildMismatchReason(requestRow: ReturnRequestRow, unifiedData: Record<string, any>) {
  const reasons: string[] = [];

  if (!isSameText(getRequestValue(requestRow, "recipientName"), unifiedData["수취인명"])) {
    reasons.push("대여자명/수취인명 불일치");
  }

  if (!isSamePhone(getRequestValue(requestRow, "phone1"), unifiedData["연락처1"])) {
    reasons.push("전화번호/연락처1 불일치");
  }

  if (!isSameText(getRequestValue(requestRow, "product"), unifiedData["제품"])) {
    reasons.push("반납기종/제품 불일치");
  }

  if (!isSameText(getRequestValue(requestRow, "contractAddress"), unifiedData["계약자주소"])) {
    reasons.push("수거주소/계약자주소 불일치");
  }

  return reasons.join(", ");
}

function mapUnifiedToReturnRequestData(
  requestRow: ReturnRequestRow,
  unifiedRow: UnifiedMatchSourceRow,
  mismatchReason: string
) {
  const data = unifiedRow.data || {};

  return {
    ...requestRow.data,

    partnerCategory: normalizeString(data["거래처분류"]),
    deviceNo: normalizeString(data["기기번호"]),

    phone2: normalizeString(data["연락처2"]),
    shippingDate: normalizeString(data["택배발송일"]),
    startDate: normalizeString(data["시작일"]),
    endDate: normalizeString(data["종료일"]),
    specialNote1: normalizeString(data["특이사항1"]),
    specialNote2: normalizeString(data["특이사항2"]),

    mismatchReason,
    unifiedId: String(unifiedRow.id),
  };
}

function findBestUnifiedMatch(requestRow: ReturnRequestRow, unifiedRows: UnifiedMatchSourceRow[]) {
  const requestPhone = getRequestValue(requestRow, "phone1");
  const requestName = getRequestValue(requestRow, "recipientName");
  const requestProduct = getRequestValue(requestRow, "product");

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

export function matchReturnRequestRows(
  requestRows: ReturnRequestRow[],
  unifiedRows: UnifiedMatchSourceRow[]
): ReturnRequestRow[] {
  const safeUnifiedRows = Array.isArray(unifiedRows) ? unifiedRows : [];

  return (Array.isArray(requestRows) ? requestRows : []).map((requestRow) => {
    const matched = findBestUnifiedMatch(requestRow, safeUnifiedRows);

    if (!matched) {
      return {
        ...requestRow,
        data: {
          ...requestRow.data,
          mismatchReason: "통합관리 매칭 없음",
          unifiedId: "",
        },
      };
    }

    const mismatchReason = buildMismatchReason(requestRow, matched.data || "");

    return {
      ...requestRow,
      data: mapUnifiedToReturnRequestData(requestRow, matched, mismatchReason),
    };
  });
}