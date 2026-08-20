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
  baseToday: Date = new Date(),
  // ✅ 선택 인자(기존 호출부는 안 넘겨도 그대로 동작). YYYY-MM-DD Set.
  // 넘기면 "만기3일전"이 공휴일 만기 건일 때 "만기3일전(공휴일)"로 별도 소카테고리로 분류된다.
  holidays?: Set<string>
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
    today,
    holidays
  );

  // 1) 만기3일전(공휴일) / 만기3일전 / 만기지남은 통합관리 상태를 기준으로 고정
  if (derived.status === "만기3일전(공휴일)") {
    return { subCategory: "만기3일전(공휴일)", derivedStatus: derived.status };
  }
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