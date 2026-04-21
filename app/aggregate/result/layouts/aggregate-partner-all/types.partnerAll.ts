export type PartnerAllSection = "보건소" | "조리원" | "온라인" | "개인" | "기타";

export type PartnerAllCell = {
  출고: number;
  대여일수: number;
  금액: number;
};

export type PartnerAllRowType = "data" | "subtotal" | "grandTotal";

export type PartnerAllRow = {
  rowType: PartnerAllRowType;
  section: PartnerAllSection | "합계";
  label: string; // 거래처 또는 기종
  values: Record<string, PartnerAllCell>;
  sum: PartnerAllCell;
  showSection: boolean;
};