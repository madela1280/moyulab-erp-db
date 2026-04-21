export function isPartnerAllMode(meta: {
  pumpScope?: "전체" | "기종";
  selectedPumpModel?: string;
}) {
  // 거래처=전체 화면은 "기종 단일 선택 모드"가 아닐 때 사용
  if (meta?.pumpScope === "기종" && meta?.selectedPumpModel) return false;
  return true;
}