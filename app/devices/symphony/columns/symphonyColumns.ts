// app/devices/symphony/columns/symphonyColumns.ts

export const symphonyColumns = [
  "제품명",
  "시스템 기기번호",
  "기종",
  "구매/렌탈",
  "반납여부",
  "에러횟수",
  "원가",
  "특이사항",
  "구매처",
  "구매일",
  "유축기 위치",
  "폐기",
  "분실",
  "재조립",
  "수리횟수",
  "수리이력1",
  "수리이력2",
  "수리이력3",
  "수리이력4",
  "수리이력5",
  "특이사항2",
] as const;

export type SymphonyColumnKey = (typeof symphonyColumns)[number];

export const DEFAULT_COL_WIDTH_UNIT_BY_KEY: Record<string, number> = (() => {
  const obj: Record<string, number> = {};
  symphonyColumns.forEach((c) => (obj[c] = 20));
  return obj;
})();

export function createEmptyData(): Record<string, any> {
  const obj: Record<string, any> = {};
  symphonyColumns.forEach((key) => {
    obj[key] = "";
  });
  return obj;
}