export type ExtendPeriod = {
  step: number; // 0,1,2...
  key: string; // "0차연장"
  start: Date;
  end: Date;
  days: number;
};

function addDaysUTC(d: Date, days: number) {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

export function calcExtendPeriods(params: {
  startDate: Date;
  stepDaysMap: Record<number, number>; // {0:30,1:15,5:20 ...}
}): ExtendPeriod[] {
  const { startDate, stepDaysMap } = params;
  const steps = Object.keys(stepDaysMap)
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n) && n >= 0)
    .sort((a, b) => a - b);

  const out: ExtendPeriod[] = [];
  let cursor = new Date(startDate.getTime());

  for (const step of steps) {
    const days = Math.max(0, Math.floor(Number(stepDaysMap[step] ?? 0)));
    if (days <= 0) continue;

    const s = new Date(cursor.getTime());
    const e = addDaysUTC(s, days - 1);

    out.push({
      step,
      key: `${step}차연장`,
      start: s,
      end: e,
      days,
    });

    // 다음 차수 시작 = 직전 종료 + 1일
    cursor = addDaysUTC(e, 1);
  }

  return out;
}