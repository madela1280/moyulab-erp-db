// app/sms/types/sms.types.ts

export const SMS_SUB_CATEGORIES = ["대여첫안내", "만기3일전", "만기3일전(공휴일)", "만기지남"] as const;
export type SmsSubCategory = (typeof SMS_SUB_CATEGORIES)[number];

export type SmsTargetStatus =
  | "pending" // 집계됨(발송 전)
  | "sending" // 발송 요청 진행/대기
  | "sent" // 알림톡 요청 성공(최종결과 확정 전일 수 있음)
  | "success" // 최종 성공 확정
  | "fail" // 최종 실패 확정
  | "excluded"; // 집계에서 제외(즉시반영으로 탈락 등)

export type SmsTargetRow = {
  /** sms 집계 row id */
  id: number;

  /** unified 원본 row id */
  unified_id: number;

  /** 소카테고리(대여첫안내/만기3일전/만기지남) */
  sub_category: SmsSubCategory;

  /** 집계 기준일(Asia/Seoul 기준, YYYY-MM-DD) */
  base_date: string;

  /** 발송에 필요한 최소 필드(통합관리에서 가져온 snapshot) */
  안내분류: string | null;
  수취인명: string | null;
  연락처1: string | null;
  연락처2: string | null;
  계약자주소: string | null;

  택배발송일: string | null;
  시작일: string | null;
  종료일: string | null;
  반납요청일: string | null;
  반납완료일: string | null;

  /** 통합관리 파생 상태(집계 시점 snapshot) */
  상태: string | null;

  /** 템플릿 치환용(예: "2026-02-01(일)") */
  만기일_표시문자: string | null;

  /** 집계/발송 상태 */
  target_status: SmsTargetStatus;

  /** 발송 시도/결과 추적용 */
  last_request_id: string | null; // SENS requestId 등
  last_message_id: string | null; // 알림톡 messageId 등
  last_failover_message_id: string | null; // 대체발송 messageId 등
  last_result_code: string | null;
  last_result_desc: string | null;

  created_at: string; // ISO
  updated_at: string; // ISO
};

export type SmsTargetsResponse = {
  ok: true;
  subCategory: SmsSubCategory;
  baseDate: string;
  rows: SmsTargetRow[];
};

export type SmsAggregateResponse = {
  ok: true;
  baseDate: string;
  /** 집계 생성/갱신된 row 수 */
  upserted: number;
  /** 제외 처리된 row 수 */
  excluded: number;
};

export type SmsSendResponse = {
  ok: boolean;
  /** 발송 요청 단위(배치) id (내부에서 생성할 수 있음) */
  batchId?: string;
  /** 성공적으로 발송 요청에 포함된 대상 수 */
  requestedCount?: number;
  /** 실패(요청 자체 실패/검증 실패) 수 */
  failedCount?: number;
  error?: string;
};

export type SmsResultSyncResponse = {
  ok: true;
  /** 최종 성공 확정 수 */
  success: number;
  /** 최종 실패 확정 수 */
  fail: number;
  /** 아직 처리중/대기 수 */
  processing: number;
};