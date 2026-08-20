// app/unified/status/calcUnifiedStatus.ts
import { parseUnifiedCell, todayStart } from "./parseUnifiedDate";

export type UnifiedStatus =
  | "" // ✅ 완전 빈행 등: 상태 표시 안 함
  | "회수완료"
  | "만기5일전"
  | "만기4일전"
  | "만기3일전"
  | "만기3일전(공휴일)"
  | "만기2일전"
  | "만기1일전"
  | "오늘만기"
  | "회수중"
  | "만기지남"
  | "대여중"
  | "발송전";

export type UnifiedStatusResult = {
  status: UnifiedStatus;
  /** UI에서 상태 글자색 처리용(예: 만기3일전 = 파란색, 오늘만기=빨간색) */
  textColor?: string;
};

type Inputs = {
  수취인명?: unknown;
  연락처1?: unknown;
  계약자주소?: unknown;

  택배발송일?: unknown;
  시작일?: unknown;
  종료일?: unknown;
  반납요청일?: unknown;
  반납완료일?: unknown;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function calcUnifiedStatus(
  input: Inputs,
  baseToday: Date = new Date(),
  // ✅ 선택 인자(기존 호출부는 안 넘겨도 그대로 동작). YYYY-MM-DD Set.
  // 넘기면 "만기3일전"이 공휴일 만기 건일 때 "만기3일전(공휴일)"로 구분 표시된다.
  holidays?: Set<string>
): UnifiedStatusResult {
  const today = todayStart(baseToday);

  const shipped = parseUnifiedCell(input.택배발송일);
  const started = parseUnifiedCell(input.시작일);
  const ended = parseUnifiedCell(input.종료일);
  const requested = parseUnifiedCell(input.반납요청일);
  const completed = parseUnifiedCell(input.반납완료일);

  // ✅ 발송전은 "완전 빈행"에는 표시하지 않기 위한 최소 정보 체크
  const hasMinimumInfo =
    hasText(input.수취인명) || hasText(input.연락처1) || hasText(input.계약자주소);

  // (1) 회수완료 최우선:
  // - 반납완료일에 값이 있으면(날짜/문자 무관) 무조건 회수완료
  if (completed.kind !== "empty") return { status: "회수완료" };

  // - 반납요청일이 "문자"면(대여취소 등) 회수완료로 간주
  if (requested.kind === "text") return { status: "회수완료" };

    // (2) 회수중: 반납요청일(날짜) 있고, 반납완료일은 비어있음
  // ✅ 만기 1~5일전보다 우선 표시되어야 함
  if (requested.kind === "date") return { status: "회수중" };

  // (3) 만기 N일전(5~1) : 오늘 = 종료일 - N 인 "딱 하루"
  if (ended.kind === "date") {
    const diff = diffDays(ended.date, today); // 종료일 - 오늘
    if (diff === 5) return { status: "만기5일전" };
    if (diff === 4) return { status: "만기4일전" };
    if (diff === 3) {
      if (holidays?.has(formatDateKey(ended.date))) {
        return { status: "만기3일전(공휴일)", textColor: "#d97706" }; // amber-600
      }
      return { status: "만기3일전", textColor: "#2563eb" }; // blue-600
    }
    if (diff === 2) return { status: "만기2일전" };
    if (diff === 1) return { status: "만기1일전" };

    // ✅ 오늘만기(빨간 글씨): 종료일이 오늘이고, 반납요청/반납완료 모두 "비어있을 때"
    if (diff === 0 && requested.kind === "empty" && completed.kind === "empty") {
      return { status: "오늘만기", textColor: "#dc2626" }; // red-600
    }
  }

  // (4) 만기지남: 종료일 < 오늘 AND 반납요청일 비어있음
  if (ended.kind === "date") {
    if (ended.date.getTime() < today.getTime()) return { status: "만기지남" };
  }

  // (5) 대여중:
  // - "택배발송일에 날짜가 있으면 발송된 것"
  // - 종료일이 없어도(비어있어도) 택배발송일이 유효한 날짜이고 오늘 <=/=> 조건 맞으면 대여중 표시
  const shippedDate = shipped.kind === "date" ? shipped.date : null;
  const startedDate = started.kind === "date" ? started.date : null;

  // ✅ 시작 기준: 택배발송일 우선, 없으면 시작일
  const startBase = shippedDate ?? startedDate;

  // ✅ 종료일이 없어도, "택배발송일이 유효한 날짜"이고 오늘이 그 날짜 이상이면 대여중
  if (shippedDate && shippedDate.getTime() <= today.getTime() && ended.kind !== "date") {
    return { status: "대여중" };
  }

  // ✅ 종료일이 있으면 기존처럼 [start..end] 범위면 대여중
  if (startBase && ended.kind === "date") {
    const t = today.getTime();
    if (startBase.getTime() <= t && t <= ended.date.getTime()) return { status: "대여중" };
  }

  // (6) 발송전(기타/누락 포함)
  // ✅ 단, 완전 빈행에는 발송전 표시하지 않음
  if (!hasMinimumInfo) return { status: "" };
  return { status: "발송전" };
}

function formatDateKey(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** a - b (일 단위), 둘 다 startOfDay로 들어온다는 전제 */
function diffDays(a: Date, b: Date) {
  return Math.round((a.getTime() - b.getTime()) / MS_PER_DAY);
}

function hasText(v: unknown) {
  return String(v ?? "").trim().length > 0;
}