// app/aggregate/run/types.aggregateRun.ts
// 집계(실행) 화면/API에서 공용으로 사용할 "집계조건 payload" 타입 정의용 파일
// - DB/브라우저 저장소 사용 없음
// - UI 라벨(한글) 그대로 타입으로 고정해서 혼동을 줄임

export type IsoDateString = string; // "YYYY-MM-DD" 형태를 기대(검증은 훅/서버에서)

export type AggregateGranularity = "일별" | "월별" | "연별";

/**
 * 비교기간
 * - UI 요구사항: 기본은 "선택안함" 체크
 * - 필요 시 전년/전월/전주를 각각 체크(다중 선택 가능)
 */
export type ComparePeriodOptions = {
  선택안함: boolean;
  전년동일기간: boolean;
  전월동일기간: boolean;
  전주동일기간: boolean;
};

export type PartnerScope = "전체" | "보건소" | "조리원" | "온라인" | "개인";

/**
 * 유축기 선택 축(확장 대비)
 * - 현재는 "전체/기종/기기번호" 같은 모드 선택 + 검색입력 조합을 염두
 */
export type PumpScope = "전체" | "기종" | "기기번호";

export type ExtendStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;
export type ExtendScope = "전체" | "0차" | `${Exclude<ExtendStep, 0>}차`;

export type RentTypeScope =
  | "전체"
  | "기기변경"
  | "재대여"
  | "서비스"
  | "대체기기"
  | "문제기기";

/**
 * 검색 입력(부분일치/자동완성 등 UI 확장 대비)
 * - 이번 1차 단계에서는 "입력값 보관 + 확인 시 payload에 포함"까지만 사용
 */
export type AggregateSearchInput = {
  거래처?: string; // 예: "수원"
  유축기?: string; // 예: "심포"
  기기번호?: string; // 예: "1123"
};

export type AggregateRunFilters = {
  거래처: PartnerScope;
  유축기: PumpScope;
  연장: ExtendScope;
  대여형태: RentTypeScope;
};

export type AggregatePeriod = {
  periodStart: IsoDateString;
  periodEnd: IsoDateString;
};

/**
 * 집계 실행 payload(추후 /api/aggregate/run 로 그대로 보낼 형태)
 * - 이번 단계(조건 UI)에서는 이 타입을 "폼 상태의 기준형"으로 사용
 */
export type AggregateRunRequest = {
  기준일자: AggregatePeriod;
  집계조건: AggregateGranularity;
  비교기간: ComparePeriodOptions;
  필터: AggregateRunFilters;
  검색: AggregateSearchInput;
};

/**
 * UI에서 "확인" 눌렀을 때 화면에 표시할 요약(텍스트) 형태가 필요하면 사용
 * (집계 실행 전 단계에서도 유용)
 */
export type AggregateRunSummary = {
  기준일자Text: string; // "2026-02-01 ~ 2026-03-17"
  집계조건Text: string; // "일별"
  비교기간Text: string; // "선택안함" 또는 "전년동일기간, 전월동일기간"
  필터Text: string; // "거래처:전체 / 유축기:기종 / 연장:전체 / 대여형태:전체"
  검색Text: string; // "거래처:수원 / 유축기:심포니 / 기기번호:112315" 등(없으면 "")
};