// app/unified/status/calcUnifiedStatus.ts
import { parseUnifiedCell, todayStart } from "./parseUnifiedDate";

export type UnifiedStatus =
  | "회수완료"
  | "만기5일전"
  | "만기4일전"
  | "만기3일전"
  | "만기2일전"
  | "만기1일전"
  | "회수중"
  | "만기지남"
  | "대여중"
  | "발송전";

export type UnifiedStatusResult = {
  status: UnifiedStatus;
  /** UI에서 상태 글자색 처리용(예: 만기3일전 = 파란색) */
  textColor?: string;
};

type Inputs = {
  택배발송일?: unknown;
  시작일?: unknown;
  종료일?: unknown;
  반납요청일?: unknown;
  반납완료일?: unknown;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function calcUnifiedStatus(input: Inputs, baseToday: Date = new Date()): UnifiedStatusResult {
  const today = todayStart(baseToday);

  const shipped = parseUnifiedCell(input.택배발송일);
  const started = parseUnifiedCell(input.시작일);
  const ended = parseUnifiedCell(input.종료일);
  const requested = parseUnifiedCell(input.반납요청일);
  const completed = parseUnifiedCell(input.반납완료일);

  // (1) 회수완료 최우선:
  // - 반납완료일에 값이 있으면(날짜/문자 무관) 무조건 회수완료
  if (completed.kind !== "empty") return { status: "회수완료" };

  // - 반납요청일이 "문자"면(대여취소 등) 회수완료로 간주
  if (requested.kind === "text") return { status: "회수완료" };

  // (2) 만기 N일전(5~1) : 오늘 = 종료일 - N 인 "딱 하루"
  if (ended.kind === "date") {
    const diff = diffDays(ended.date, today); // 종료일 - 오늘
    if (diff === 5) return { status: "만기5일전" };
    if (diff === 4) return { status: "만기4일전" };
    if (diff === 3) return { status: "만기3일전", textColor: "#2563eb" }; // blue-600
    if (diff === 2) return { status: "만기2일전" };
    if (diff === 1) return { status: "만기1일전" };
  }

  // (3) 회수중: 반납요청일(날짜) 있고, 반납완료일은 비어있음
  if (requested.kind === "date") return { status: "회수중" };

  // (4) 만기지남: 종료일 < 오늘 AND 반납요청일 비어있음
  if (ended.kind === "date") {
    if (ended.date.getTime() < today.getTime()) return { status: "만기지남" };
  }

  // (5) 대여중: (택배발송일 있으면 그날부터, 없으면 시작일부터) 오늘이 [start..end] 안
  const startBase = shipped.kind === "date" ? shipped.date : started.kind === "date" ? started.date : null;
  if (startBase && ended.kind === "date") {
    const t = today.getTime();
    if (startBase.getTime() <= t && t <= ended.date.getTime()) return { status: "대여중" };
  }

  // (6) 발송전(기타/누락 포함)
  return { status: "발송전" };
}

/** a - b (일 단위), 둘 다 startOfDay로 들어온다는 전제 */
function diffDays(a: Date, b: Date) {
  return Math.round((a.getTime() - b.getTime()) / MS_PER_DAY);
}