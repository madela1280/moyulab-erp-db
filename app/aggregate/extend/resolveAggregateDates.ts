export type ResolvedAggregateDates = {
  start: Date | null;
  end: Date | null;
  excluded: boolean;
  reason: string;
};

function parseDateFlexible(v: any): Date | null {
  const raw = String(v ?? "").trim();
  if (!raw) return null;
  const s = raw.replaceAll(".", "-").replaceAll("/", "-");

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d) return dt;
    return null;
  }

  m = s.match(/^(\d{2})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const y = 2000 + Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d) return dt;
    return null;
  }

  return null;
}

function isTextLike(v: any) {
  const raw = String(v ?? "").trim();
  if (!raw) return false;
  return parseDateFlexible(raw) === null;
}

function addDaysUTC(d: Date, days: number) {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function getTodayUTC() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export function resolveAggregateDates(input: {
  startDateRaw: any;
  requestDateRaw: any;
  completeDateRaw: any;
  endDateRaw: any;
  isNursery: boolean; // 조리원 여부
}): ResolvedAggregateDates {
  const start = parseDateFlexible(input.startDateRaw);
  if (!start) return { start: null, end: null, excluded: true, reason: "NO_START" };

  // 추가 규칙1: 반납요청일 문자면 제외
  if (isTextLike(input.requestDateRaw)) {
    return { start, end: null, excluded: true, reason: "REQUEST_TEXT" };
  }

  const completeDt = parseDateFlexible(input.completeDateRaw);
  const endDt = parseDateFlexible(input.endDateRaw);

  let end: Date | null = null;

  // 규칙A
  if (completeDt) {
    end = addDaysUTC(completeDt, -1);
  }
  // 규칙B
  else if (String(input.completeDateRaw ?? "").trim()) {
    end = endDt || null;
  }
  // 규칙C
  else {
    if (input.isNursery) {
      end = getTodayUTC();
    } else {
      end = endDt || null;
    }
  }

  if (!end) return { start, end: null, excluded: true, reason: "NO_END" };
  if (end.getTime() < start.getTime()) {
    return { start, end, excluded: true, reason: "END_BEFORE_START" };
  }

  return { start, end, excluded: false, reason: "OK" };
}