// app/views/sms/service/serviceSms.ts
//
// 문자(SMS/알림톡) 도메인 API 호출 래퍼
// - UI에서는 이 파일만 통해 /api/sms/* 를 호출한다.
//
// 정책(안전 최우선):
// - 집계는 05시 배치 1회만 수행한다.
// - 중복발송/오류/상태불일치 소지를 완전히 제거하기 위해
//   클라이언트에서 발송(send) / 결과동기화(result) / 집계 트리거(aggregate) / 즉시반영(recompute)을 호출하지 않는다.

import type { SmsSubCategory, SmsTargetsResponse } from "@/sms/types/sms.types";

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

/** ⚠️ 비활성화됨 */
export async function runSmsAggregate(): Promise<never> {
  throw new Error("disabled");
}

/** ⚠️ 비활성화됨 */
export async function recomputeSmsForUnified(): Promise<never> {
  throw new Error("disabled");
}

/** ⚠️ 비활성화됨 */
export async function sendSmsAuto(): Promise<never> {
  throw new Error("disabled");
}

/** ⚠️ 비활성화됨 */
export async function syncSmsResults(): Promise<never> {
  throw new Error("disabled");
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

/** ⚠️ 비활성화됨: 발송 기능을 막았으므로 설정도 클라이언트에서 조작하지 않는다. */
export async function fetchSmsSettings(): Promise<never> {
  throw new Error("disabled");
}

/** ⚠️ 비활성화됨: 발송 기능을 막았으므로 설정도 클라이언트에서 조작하지 않는다. */
export async function patchSmsSetting(): Promise<never> {
  throw new Error("disabled");
}