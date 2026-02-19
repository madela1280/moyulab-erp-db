// app/sms/utils/formatKoreanDate.ts
//
// 알림톡 템플릿 변수 치환용 날짜 포맷 유틸
// - 입력(통합관리): "YYYY-MM-DD" / "YYYYMMDD" / "YYYY.MM.DD" / Date / timestamp(ms) 등
// - 출력 예: "2026-02-01(일)"
//
// 주의: 서버/클라이언트 어디서든 일관되게 동작하도록 "로컬 타임존(Date 객체)" 기준으로만 처리.

import { parseUnifiedCell } from "@/unified/status/parseUnifiedDate";

const KO_DOW = ["일", "월", "화", "수", "목", "금", "토"] as const;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** "종료일" 등 셀 값을 받아 "YYYY-MM-DD(요일)"로 반환. 날짜가 아니면 null */
export function formatKoreanDateWithDow(value: unknown): string | null {
  const parsed = parseUnifiedCell(value);
  if (parsed.kind !== "date") return null;

  const d = parsed.date; // startOfDay 된 Date
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  const dow = KO_DOW[d.getDay()] ?? "";
  return `${y}-${m}-${day}(${dow})`;
}

/** 날짜가 아니면 빈문자열로(템플릿 치환 안전용) */
export function formatKoreanDateWithDowOrEmpty(value: unknown): string {
  return formatKoreanDateWithDow(value) ?? "";
}