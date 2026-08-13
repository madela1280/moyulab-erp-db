// app/api/kakao/_lib/rental.ts
//
// 통합관리(unified) 조회 + 상태 판정
// 챗봇이 쓰는 최소 기능만 담는다.

import { query } from "@/lib/db";

export type Rental = {
  id: number;
  data: Record<string, any>;
  /** 반납요청일 있음 = 택배사 접수 완료 */
  pickupRequested: boolean;
  /** 반납완료일 있음 = 회사 회수 완료 */
  recovered: boolean;
  /** 만기까지 남은 일수. 음수면 연체 */
  daysLeft: number | null;
};

/* ------------------------------------------------------------------ */
/* 조회                                                                */
/* ------------------------------------------------------------------ */

/**
 * 전화번호로 대여건을 찾는다.
 * 진행중(반납완료일 없음)을 먼저, 그다음 최신순.
 */
export async function findByPhone(phone: string, limit = 5): Promise<Rental[]> {
  const digits = String(phone ?? "").replace(/[^0-9]/g, "");
  if (!digits) return [];

  const r = await query(
    `SELECT id, data
     FROM unified
     WHERE regexp_replace(COALESCE(data->>'연락처1',''), '[^0-9]', '', 'g') = $1
        OR regexp_replace(COALESCE(data->>'연락처2',''), '[^0-9]', '', 'g') = $1
     ORDER BY
       CASE WHEN COALESCE(data->>'반납완료일','') = '' THEN 0 ELSE 1 END ASC,
       id DESC
     LIMIT $2`,
    [digits, limit]
  );

  return (r.rows ?? []).map(toRental);
}

export async function findById(id: number): Promise<Rental | null> {
  if (!Number.isFinite(id)) return null;
  const r = await query(`SELECT id, data FROM unified WHERE id = $1`, [id]);
  return r.rows?.[0] ? toRental(r.rows[0]) : null;
}

function toRental(row: any): Rental {
  const data = row?.data && typeof row.data === "object" ? row.data : {};
  const end = parseDate(data["종료일"]);

  return {
    id: Number(row.id),
    data,
    pickupRequested: parseDate(data["반납요청일"]) !== null,
    recovered: parseDate(data["반납완료일"]) !== null,
    daysLeft: end ? Math.round((end.getTime() - todayStart().getTime()) / 86400000) : null,
  };
}

/* ------------------------------------------------------------------ */
/* 날짜                                                                */
/* ------------------------------------------------------------------ */

function todayStart(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * 장부 셀 값이 날짜면 Date, 아니면 null.
 * "대여취소" 같은 문자나 "1900-01-00" placeholder는 null 처리.
 */
export function parseDate(v: unknown): Date | null {
  if (v === null || v === undefined) return null;

  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;

  const s = String(v).trim();
  if (!s) return null;
  if (/^1900[-./]01[-./]00/.test(s)) return null;

  const m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (!m) return null;

  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);

  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

export function ymd(v: unknown): string {
  const d = parseDate(v);
  if (!d) return "-";
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mo}-${day}`;
}

export function text(v: unknown): string {
  const s = String(v ?? "").trim();
  return s || "-";
}

/* ------------------------------------------------------------------ */
/* 상태 문구                                                           */
/* ------------------------------------------------------------------ */

export function statusLabel(r: Rental): string {
  if (r.recovered) return "회수완료";
  if (r.pickupRequested) return "수거 접수됨";
  if (parseDate(r.data["택배발송일"]) === null) return "발송 준비중";
  if (r.daysLeft === null) return "대여중";
  if (r.daysLeft < 0) return `만기 ${Math.abs(r.daysLeft)}일 지남`;
  if (r.daysLeft === 0) return "오늘 만기";
  if (r.daysLeft <= 5) return `만기 ${r.daysLeft}일 전`;
  return "대여중";
}

/** 연체료 단가 (약관 7조). 환불 계산용 단가와는 다른 값이므로 섞지 말 것. */
const OVERDUE_FEE: Record<string, number> = {
  심포니: 6000,
  락티나: 3000,
  스윙맥시: 1500,
  스윙: 1400,
  프리스타일: 1700,
};

export function overdueFee(r: Rental): { days: number; daily: number; amount: number } {
  const product = String(r.data["제품"] ?? "").trim();

  let daily = 0;
  // 스윙맥시가 스윙보다 먼저 걸리도록 긴 이름부터 검사
  for (const model of ["스윙맥시", "심포니", "락티나", "프리스타일", "스윙"]) {
    if (product.includes(model)) {
      daily = OVERDUE_FEE[model];
      break;
    }
  }

  const days = !r.recovered && r.daysLeft !== null && r.daysLeft < 0 ? Math.abs(r.daysLeft) : 0;
  return { days, daily, amount: days * daily };
}
