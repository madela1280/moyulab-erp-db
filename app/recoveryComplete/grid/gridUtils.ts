export const GRID_ROW_HEIGHT = 24;
export const GRID_OVERSCAN = 12;

export function shallowEqualRecord(
  a: Record<string, any> | undefined,
  b: Record<string, any> | undefined
) {
  if (a === b) return true;
  if (!a || !b) return false;

  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;

  for (const k of ak) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (a[k] !== b[k]) return false;
  }

  return true;
}

export function calcVisibleRange(el: HTMLDivElement, rowCount: number) {
  const top = el.scrollTop;
  const height = el.clientHeight;

  const start = Math.max(0, Math.floor(top / GRID_ROW_HEIGHT) - GRID_OVERSCAN);
  const end = Math.min(
    Math.max(0, rowCount - 1),
    Math.ceil((top + height) / GRID_ROW_HEIGHT) + GRID_OVERSCAN
  );

  return { start, end };
}

export function clampWidthUnit(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 20;
  return Math.max(1, Math.min(200, Math.floor(n)));
}

export function getWidthPx(colWidthUnitByKey: Record<string, number>, key: string) {
  const BASE = 140;
  const MIN = 40;
  const MAX = key === "계약자주소" ? 525 : 420;

  const unit = colWidthUnitByKey[key] ?? 20;
  const px = Math.round((BASE * unit) / 20);
  return Math.max(MIN, Math.min(MAX, px));
}

export function parseClipboardTSV(text: string) {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);

  return lines.map((line) => line.split("\t"));
}