// app/views/sms/service/serviceSms.ts
//
// 문자(SMS/알림톡) 도메인 API 호출 래퍼
// - UI에서는 이 파일만 통해 /api/sms/* 를 호출한다.
//
// 정책 변경(중요):
// - 집계는 05시 배치 1회만 수행한다.
// - UI/클라이언트에서 집계를 트리거하거나(수동 집계/새로고침 집계),
//   통합관리 수정에 따라 sms_targets를 즉시 재계산(recompute)하는 경로는 비활성화한다.
//   (05시 집계 결과에 영향을 주는 경로 제거)

import type {
  SmsAggregateResponse,
  SmsResultSyncResponse,
  SmsSendResponse,
  SmsSubCategory,
  SmsTargetsResponse,
} from "@/sms/types/sms.types";

function qs(params: Record<string, string | number | boolean | null | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined) continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export async function fetchSmsTargets(args: {
  subCategory: SmsSubCategory;
  baseDate?: string; // YYYY-MM-DD (미지정이면 서버에서 today 처리)
}) {
  const url =
    "/api/sms/targets" + qs({ subCategory: args.subCategory, baseDate: args.baseDate });

  const r = await fetch(url, { cache: "no-store" });
  const j = (await r.json().catch(() => null)) as SmsTargetsResponse | any;

  if (!r.ok || !j?.ok) {
    throw new Error(j?.error || `FAILED(${r.status})`);
  }
  return j as SmsTargetsResponse;
}

/**
 * ⚠️ 비활성화됨
 * - 05시 배치 1회만 집계 허용(클라이언트에서 집계 트리거 금지)
 * - 이 함수는 의도적으로 네트워크 호출을 하지 않는다.
 */
export async function runSmsAggregate(_args?: { baseDate?: string }): Promise<SmsAggregateResponse> {
  throw new Error("disabled: sms aggregate can only run by 05:00 batch");
}

/**
 * ⚠️ 비활성화됨
 * - 05시 집계 이후 통합관리 수정이 sms_targets에 영향을 주는 경로 제거
 * - 이 함수는 의도적으로 네트워크 호출을 하지 않는다.
 */
export async function recomputeSmsForUnified(_args: {
  unifiedId: number;
  baseDate?: string;
}): Promise<{ ok: true }> {
  throw new Error("disabled: sms recompute is not allowed");
}

export async function sendSmsAuto(args: {
  subCategory: SmsSubCategory;
  baseDate?: string;
  /** 선택 발송(없으면 전체 pending 대상) */
  targetIds?: number[];
  /** dryRun이면 실제 발송 호출 없이 검증만(서버 구현에 따라) */
  dryRun?: boolean;
}) {
  const r = await fetch("/api/sms/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });

  const j = (await r.json().catch(() => null)) as SmsSendResponse | any;

  if (!r.ok || !j) {
    throw new Error(j?.error || `FAILED(${r.status})`);
  }
  return j as SmsSendResponse;
}

export async function syncSmsResults(args: {
  /** 특정 batchId만 확정(없으면 진행중 전체를 조회/확정) */
  batchId?: string;
  baseDate?: string;
}) {
  const r = await fetch("/api/sms/result", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });

  const j = (await r.json().catch(() => null)) as SmsResultSyncResponse | any;

  if (!r.ok || !j?.ok) {
    throw new Error(j?.error || `FAILED(${r.status})`);
  }
  return j as SmsResultSyncResponse;
}

export type SmsTemplateMapRow = {
  id: number;
  sub_category: SmsSubCategory;
  guide_name: string | null; // 안내분류
  template_code: string; // SENS templateCode
  plus_friend_id: string; // 채널 id
  use_sms_failover: boolean;
  failover_from: string | null;
  updated_at: string;
};

export async function fetchSmsSettings() {
  const r = await fetch("/api/sms/settings", { cache: "no-store" });
  const j = (await r.json().catch(() => null)) as { ok: true; rows: SmsTemplateMapRow[] } | any;

  if (!r.ok || !j?.ok) {
    throw new Error(j?.error || `FAILED(${r.status})`);
  }
  return j as { ok: true; rows: SmsTemplateMapRow[] };
}

export async function patchSmsSetting(
  input: Partial<SmsTemplateMapRow> & {
    sub_category: SmsSubCategory;
    template_code: string;
    plus_friend_id: string;
  }
) {
  const r = await fetch("/api/sms/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const j = (await r.json().catch(() => null)) as { ok: boolean; error?: string } | any;

  if (!r.ok || !j?.ok) {
    throw new Error(j?.error || `FAILED(${r.status})`);
  }
  return j as { ok: true };
}