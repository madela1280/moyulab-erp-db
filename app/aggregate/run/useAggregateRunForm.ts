// app/aggregate/run/useAggregateRunForm.ts
"use client";

import { useCallback, useMemo, useState } from "react";
import type {
  AggregateGranularity,
  AggregateRunRequest,
  AggregateRunSummary,
  ComparePeriodOptions,
  ExtendScope,
  PartnerScope,
  PumpScope,
  RentTypeScope,
} from "./types.aggregateRun";

type FieldErrors = Partial<
  Record<
    | "periodStart"
    | "periodEnd"
    | "periodRange"
    | "granularity"
    | "compare"
    | "dailyRangeTooLong",
    string
  >
>;

function toISODateString(v: string) {
  return String(v ?? "").trim(); // 기대: "YYYY-MM-DD"
}

function parseISODateToUTC(v: string): Date | null {
  const s = toISODateString(v);
  if (!s) return null;

  // "YYYY-MM-DD"만 허용(대략 체크)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;

  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);

  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;

  // UTC 기준 날짜로 생성(타임존 이슈 최소화)
  const dt = new Date(Date.UTC(y, mo - 1, d));
  // 역검증(예: 2026-02-31 같은 값 걸러내기)
  if (dt.getUTCFullYear() !== y) return null;
  if (dt.getUTCMonth() !== mo - 1) return null;
  if (dt.getUTCDate() !== d) return null;

  return dt;
}

function diffDaysInclusiveUTC(a: Date, b: Date) {
  const ms = b.getTime() - a.getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  return days + 1; // inclusive
}

function joinNonEmpty(parts: string[], sep: string) {
  return parts.filter(Boolean).join(sep);
}

export type AggregateRunFormState = {
  // 기준일자
  periodStart: string;
  periodEnd: string;

  // 필수
  granularity: AggregateGranularity | "";

  // 필수(기본 선택안함 true)
  compare: ComparePeriodOptions;

  // 선택 필터(현재는 값만 유지)
  partnerScope: PartnerScope;
  pumpScope: PumpScope;
  extendScope: ExtendScope;
  rentTypeScope: RentTypeScope;

  // 검색(선택)
  searchPartner: string;
  searchPump: string;
  searchDeviceNo: string;
};

export type AggregateRunConfirmResult =
  | {
      ok: true;
      request: AggregateRunRequest;
      summary: AggregateRunSummary;
    }
  | {
      ok: false;
      errors: FieldErrors;
    };

export function createDefaultAggregateRunFormState(
  init?: Partial<AggregateRunFormState>
): AggregateRunFormState {
  return {
    periodStart: init?.periodStart ?? "",
    periodEnd: init?.periodEnd ?? "",
    granularity: init?.granularity ?? "",

    compare: init?.compare ?? {
      선택안함: true,
      전년동일기간: false,
      전월동일기간: false,
      전주동일기간: false,
    },

    partnerScope: init?.partnerScope ?? "전체",
    pumpScope: init?.pumpScope ?? "전체",
    extendScope: init?.extendScope ?? "전체",
    rentTypeScope: init?.rentTypeScope ?? "전체",

    searchPartner: init?.searchPartner ?? "",
    searchPump: init?.searchPump ?? "",
    searchDeviceNo: init?.searchDeviceNo ?? "",
  };
}

function normalizeCompare(next: ComparePeriodOptions): ComparePeriodOptions {
  const anyOther =
    !!next.전년동일기간 || !!next.전월동일기간 || !!next.전주동일기간;

  // 다른 항목이 하나라도 켜졌으면 선택안함은 자동 OFF
  if (anyOther) {
    return {
      선택안함: false,
      전년동일기간: !!next.전년동일기간,
      전월동일기간: !!next.전월동일기간,
      전주동일기간: !!next.전주동일기간,
    };
  }

  // 아무것도 안 켜진 상태는 "선택안함"을 기본 ON으로 복구
  if (!next.선택안함) {
    return { ...next, 선택안함: true };
  }

  return {
    선택안함: true,
    전년동일기간: false,
    전월동일기간: false,
    전주동일기간: false,
  };
}

function buildRequest(state: AggregateRunFormState): AggregateRunRequest {
  return {
    기준일자: {
      periodStart: toISODateString(state.periodStart),
      periodEnd: toISODateString(state.periodEnd),
    },
    집계조건: state.granularity as AggregateGranularity,
    비교기간: normalizeCompare(state.compare),
    필터: {
      거래처: state.partnerScope,
      유축기: state.pumpScope,
      연장: state.extendScope,
      대여형태: state.rentTypeScope,
    },
    검색: {
      거래처: state.searchPartner?.trim() || undefined,
      유축기: state.searchPump?.trim() || undefined,
      기기번호: state.searchDeviceNo?.trim() || undefined,
    },
  };
}

function buildSummary(req: AggregateRunRequest): AggregateRunSummary {
  const compareOn = [
    req.비교기간.전년동일기간 ? "전년동일기간" : "",
    req.비교기간.전월동일기간 ? "전월동일기간" : "",
    req.비교기간.전주동일기간 ? "전주동일기간" : "",
  ].filter(Boolean);

  const compareText =
    compareOn.length > 0 ? compareOn.join(", ") : "선택안함";

  const filterText = `거래처:${req.필터.거래처} / 유축기:${req.필터.유축기} / 연장:${req.필터.연장} / 대여형태:${req.필터.대여형태}`;

  const searchParts = [
    req.검색.거래처 ? `거래처:${req.검색.거래처}` : "",
    req.검색.유축기 ? `유축기:${req.검색.유축기}` : "",
    req.검색.기기번호 ? `기기번호:${req.검색.기기번호}` : "",
  ].filter(Boolean);

  return {
    기준일자Text: `${req.기준일자.periodStart} ~ ${req.기준일자.periodEnd}`,
    집계조건Text: req.집계조건,
    비교기간Text: compareText,
    필터Text: filterText,
    검색Text: joinNonEmpty(searchParts, " / "),
  };
}

function validate(state: AggregateRunFormState): FieldErrors {
  const errors: FieldErrors = {};

  const ps = toISODateString(state.periodStart);
  const pe = toISODateString(state.periodEnd);

  const ds = parseISODateToUTC(ps);
  const de = parseISODateToUTC(pe);

  if (!ps) errors.periodStart = "기준 시작일을 선택해 주세요.";
  if (!pe) errors.periodEnd = "기준 종료일을 선택해 주세요.";

  if (ps && !ds) errors.periodStart = "시작일 형식이 올바르지 않습니다.";
  if (pe && !de) errors.periodEnd = "종료일 형식이 올바르지 않습니다.";

  if (ds && de) {
    if (de.getTime() < ds.getTime()) {
      errors.periodRange = "종료일은 시작일보다 빠를 수 없습니다.";
    }
  }

  if (!state.granularity) {
    errors.granularity = "집계조건(일별/월별/연별)을 선택해 주세요.";
  }

  // 비교기간은 기본 선택안함이라 '필수 미선택' 상황은 거의 없지만 안전장치
  const normalizedCompare = normalizeCompare(state.compare);
  const anySelected =
    normalizedCompare.선택안함 ||
    normalizedCompare.전년동일기간 ||
    normalizedCompare.전월동일기간 ||
    normalizedCompare.전주동일기간;

  if (!anySelected) {
    errors.compare = "비교기간을 선택해 주세요.";
  }

  // 일별: 최대 1개월(=31일) 제한
  if (state.granularity === "일별" && ds && de && !errors.periodRange) {
    const days = diffDaysInclusiveUTC(ds, de);
    if (days > 31) {
      errors.dailyRangeTooLong = "일별 집계는 최대 한 달(31일)까지만 가능합니다.";
    }
  }

  return errors;
}

export function useAggregateRunForm(init?: Partial<AggregateRunFormState>) {
  const [state, setState] = useState<AggregateRunFormState>(() =>
    createDefaultAggregateRunFormState(init)
  );
  const [lastErrors, setLastErrors] = useState<FieldErrors>({});
  const [lastConfirm, setLastConfirm] = useState<{
    request: AggregateRunRequest;
    summary: AggregateRunSummary;
  } | null>(null);

  const setPeriodStart = useCallback((v: string) => {
    setState((prev) => ({ ...prev, periodStart: v }));
  }, []);

  const setPeriodEnd = useCallback((v: string) => {
    setState((prev) => ({ ...prev, periodEnd: v }));
  }, []);

  const setGranularity = useCallback((v: AggregateGranularity | "") => {
    setState((prev) => ({ ...prev, granularity: v }));
  }, []);

  const setCompare = useCallback((patch: Partial<ComparePeriodOptions>) => {
    setState((prev) => ({
      ...prev,
      compare: normalizeCompare({ ...prev.compare, ...patch }),
    }));
  }, []);

  const toggleCompare = useCallback(
    (key: keyof ComparePeriodOptions) => {
      setState((prev) => {
        if (key === "선택안함") {
          return {
            ...prev,
            compare: normalizeCompare({
              선택안함: true,
              전년동일기간: false,
              전월동일기간: false,
              전주동일기간: false,
            }),
          };
        }
        const next = { ...prev.compare, [key]: !prev.compare[key] } as ComparePeriodOptions;
        return { ...prev, compare: normalizeCompare(next) };
      });
    },
    []
  );

  const setPartnerScope = useCallback((v: PartnerScope) => {
    setState((prev) => ({ ...prev, partnerScope: v }));
  }, []);

  const setPumpScope = useCallback((v: PumpScope) => {
    setState((prev) => ({ ...prev, pumpScope: v }));
  }, []);

  const setExtendScope = useCallback((v: ExtendScope) => {
    setState((prev) => ({ ...prev, extendScope: v }));
  }, []);

  const setRentTypeScope = useCallback((v: RentTypeScope) => {
    setState((prev) => ({ ...prev, rentTypeScope: v }));
  }, []);

  const setSearchPartner = useCallback((v: string) => {
    setState((prev) => ({ ...prev, searchPartner: v }));
  }, []);

  const setSearchPump = useCallback((v: string) => {
    setState((prev) => ({ ...prev, searchPump: v }));
  }, []);

  const setSearchDeviceNo = useCallback((v: string) => {
    setState((prev) => ({ ...prev, searchDeviceNo: v }));
  }, []);

  const canConfirm = useMemo(() => {
    const errs = validate(state);
    return Object.keys(errs).length === 0;
  }, [state]);

  const confirm = useCallback((): AggregateRunConfirmResult => {
    const errs = validate(state);
    setLastErrors(errs);

    if (Object.keys(errs).length > 0) {
      setLastConfirm(null);
      return { ok: false, errors: errs };
    }

    const request = buildRequest(state);
    const summary = buildSummary(request);
    setLastConfirm({ request, summary });
    return { ok: true, request, summary };
  }, [state]);

  const reset = useCallback(() => {
    setState(createDefaultAggregateRunFormState(init));
    setLastErrors({});
    setLastConfirm(null);
  }, [init]);

  return {
    state,
    setState,

    // fields setters
    setPeriodStart,
    setPeriodEnd,
    setGranularity,
    setCompare,
    toggleCompare,
    setPartnerScope,
    setPumpScope,
    setExtendScope,
    setRentTypeScope,
    setSearchPartner,
    setSearchPump,
    setSearchDeviceNo,

    // derived
    canConfirm,
    lastErrors,
    lastConfirm,

    // actions
    confirm,
    reset,
  };
}