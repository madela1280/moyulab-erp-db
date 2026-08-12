import type { ReturnRequestColumn } from "@/customerReception/return-request/types";

export const RETURN_REQUEST_CURRENT_COLUMNS: ReturnRequestColumn[] = [
  { key: "checked", label: "확인", width: 70, source: "check", editable: true },
  { key: "receivedAt", label: "접수일자", width: 150, source: "system" },
  { key: "partnerCategory", label: "거래처분류", width: 120, source: "erp" },
  { key: "deviceNo", label: "기기번호", width: 110, source: "erp" },
  { key: "product", label: "제품", width: 110, source: "web", editable: true },
  { key: "recipientName", label: "수취인명", width: 110, source: "web", editable: true },
  { key: "phone1", label: "연락처1", width: 120, source: "web", editable: true },
  { key: "phone2", label: "연락처2", width: 120, source: "erp" },
  { key: "contractAddress", label: "계약자주소", width: 220, source: "web", editable: true },
  { key: "shippingDate", label: "택배발송일", width: 120, source: "erp" },
  { key: "startDate", label: "시작일", width: 110, source: "erp" },
  { key: "endDate", label: "종료일", width: 110, source: "erp" },
  { key: "returnRequestDate", label: "반납요청일", width: 120, source: "web", editable: true },
  { key: "specialNote1", label: "특이사항1", width: 140, source: "erp" },
  { key: "specialNote2", label: "특이사항2", width: 140, source: "erp" },
  { key: "returnMemo", label: "반납메모", width: 180, source: "web", editable: true },
  { key: "mismatchReason", label: "불일치사유", width: 220, source: "system", editable: true },
];

export const RETURN_REQUEST_LIST_COLUMNS: ReturnRequestColumn[] = [
  { key: "processStatus", label: "처리상태", width: 90, source: "system" },
  { key: "receivedAt", label: "접수일자", width: 150, source: "system" },
  { key: "partnerCategory", label: "거래처분류", width: 120, source: "erp" },
  { key: "deviceNo", label: "기기번호", width: 110, source: "erp" },
  { key: "product", label: "제품", width: 110, source: "web" },
  { key: "recipientName", label: "수취인명", width: 110, source: "web" },
  { key: "phone1", label: "연락처1", width: 120, source: "web" },
  { key: "phone2", label: "연락처2", width: 120, source: "erp" },
  { key: "contractAddress", label: "계약자주소", width: 220, source: "web" },
  { key: "shippingDate", label: "택배발송일", width: 120, source: "erp" },
  { key: "startDate", label: "시작일", width: 110, source: "erp" },
  { key: "endDate", label: "종료일", width: 110, source: "erp" },
  { key: "returnRequestDate", label: "반납요청일", width: 120, source: "web" },
  { key: "specialNote1", label: "특이사항1", width: 140, source: "erp" },
  { key: "specialNote2", label: "특이사항2", width: 140, source: "erp" },
  { key: "returnMemo", label: "반납메모", width: 180, source: "web" },
  { key: "mismatchReason", label: "최초 불일치사유", width: 220, source: "system" },
  { key: "mismatchResolvedNote", label: "불일치 수정여부", width: 140, source: "system" },
];

export const RETURN_REQUEST_WEB_COLUMN_KEYS = new Set([
  "product",
  "recipientName",
  "phone1",
  "contractAddress",
  "returnRequestDate",
  "returnMemo",
]);

export function createEmptyReturnRequestRow(index: number): import("@/customerReception/return-request/types").ReturnRequestRow {
  return {
    id: `empty-${index}`,
    checked: false,
    processStatus: "접수중",
    receivedAt: "",
    data: RETURN_REQUEST_CURRENT_COLUMNS.reduce<Record<string, string>>((acc, col) => {
      acc[col.key] = "";
      return acc;
    }, {}),
  };
}