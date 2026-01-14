// app/unified/columns/unifiedColumns.ts

export const unifiedColumns = [
  "거래처분류",
  "상태",
  "안내분류",
  "구매/렌탈",
  "기기번호",
  "기종",
  "에러횟수",
  "제품",
  "수취인명",
  "연락처1",
  "연락처2",
  "계약자주소",
  "택배발송일",
  "시작일",
  "종료일",
  "반납요청일",
  "반납완료일",
  "특이사항1",
  "특이사항2",
  "총연장횟수",
  "신청일",
  "0차연장",
  "1차연장",
  "2차연장",
  "3차연장",
  "4차연장",
  "5차연장",
] as const;

export type UnifiedColumnKey = (typeof unifiedColumns)[number];

export const DEFAULT_COL_WIDTH_UNIT_BY_KEY: Record<string, number> = (() => {
  const obj: Record<string, number> = {};
  unifiedColumns.forEach((c) => (obj[c] = 20));
  return obj;
})();

export function createEmptyData(): Record<string, any> {
  const obj: Record<string, any> = {};
  unifiedColumns.forEach((key) => {
    obj[key] = "";
  });
  return obj;
}