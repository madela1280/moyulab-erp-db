// app/sms/rules/smsSubCategoryRules.ts
//
// 통합관리(unified) row(data)를 "문자 소카테고리"로 분류하는 규칙 모음.
// - 데이터 소스는 unified의 data
// - 만기3일전/만기지남은 통합관리 상태(calcUnifiedStatus) 기준을 그대로 따른다.
// - 대여첫안내는 "시작일 = 오늘" 기준(요구사항)으로 판정한다.

import { calcUnifiedStatus } from "@/unified/status/calcUnifiedStatus";
import { parseUnifiedCell, todayStart } from "@/unified/status/parseUnifiedDate";
import type { SmsSubCategory } from "@/sms/types/sms.types";

export type SmsSubCategoryDecision = {
  subCategory: SmsSubCategory | null;
  derivedStatus: string | null; // calcUnifiedStatus 결과 문자열(없으면 null)
};

type UnifiedData = Record<string, any>;

export function decideSmsSubCategoryFromUnifiedRow(
  data: UnifiedData,
  baseToday: Date = new Date()
): SmsSubCategoryDecision {
  const today = todayStart(baseToday);

  const derived = calcUnifiedStatus(
    {
      수취인명: data?.["수취인명"],
      연락처1: data?.["연락처1"],
      계약자주소: data?.["계약자주소"],
      택배발송일: data?.["택배발송일"],
      시작일: data?.["시작일"],
      종료일: data?.["종료일"],
      반납요청일: data?.["반납요청일"],
      반납완료일: data?.["반납완료일"],
    },
    today
  );

  // 1) 만기3일전 / 만기지남은 통합관리 상태를 기준으로 고정
  if (derived.status === "만기3일전") {
    return { subCategory: "만기3일전", derivedStatus: derived.status };
  }
  if (derived.status === "만기지남") {
    return { subCategory: "만기지남", derivedStatus: derived.status };
  }

  // 2) 대여첫안내: 시작일이 "오늘"인 경우
  //    (요구사항이 '시작일(오늘)'이므로 택배발송일/기타는 보조로 쓰지 않는다)
  const started = parseUnifiedCell(data?.["시작일"]);
  if (started.kind === "date") {
    if (started.date.getTime() === today.getTime()) {
      return { subCategory: "대여첫안내", derivedStatus: derived.status || null };
    }
  }

  return { subCategory: null, derivedStatus: derived.status || null };
}