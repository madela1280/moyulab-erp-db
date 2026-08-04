export type ReturnRecoveryColumn = {
  key: string;
  label: string;
  width: number;
};

export const RETURN_RECOVERY_COLUMNS: ReturnRecoveryColumn[] = [
  { key: "senderName", label: "보내시는분", width: 120 },
  { key: "senderPhone1", label: "보내시는분 전화번호1", width: 160 },
  { key: "senderPhone2", label: "보내시는분전화번호2", width: 160 },
  { key: "senderAddress", label: "보내시는분 총주소", width: 360 },
  { key: "itemName", label: "품목명", width: 260 },
  { key: "pickupDate", label: "수거일자", width: 140 },
  { key: "boxCount", label: "박스수량", width: 90 },
  { key: "zipCode", label: "우편번호", width: 100 },
  { key: "blankX1", label: "X", width: 80 },
  { key: "blankX2", label: "X", width: 80 },
  { key: "blankX3", label: "X", width: 80 },
  { key: "memo", label: "메모", width: 260 },
  { key: "originalInvoiceNo", label: "원송장번호", width: 130 },
];

export type ReturnRecoveryRow = {
  id: string;
  data: Record<string, string>;
};

export function createEmptyReturnRecoveryRow(index: number): ReturnRecoveryRow {
  return {
    id: `empty-${index}`,
    data: RETURN_RECOVERY_COLUMNS.reduce<Record<string, string>>((acc, col) => {
      acc[col.key] = "";
      return acc;
    }, {}),
  };
}