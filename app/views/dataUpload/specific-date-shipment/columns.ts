export type SpecificDateShipmentColumn = {
  key: string;
  label: string;
  width: number;
};

export const SPECIFIC_DATE_SHIPMENT_COLUMNS: SpecificDateShipmentColumn[] = [
  { key: "checked", label: "확인", width: 60 },
  { key: "recipientName", label: "수취인", width: 120 },
  { key: "phone1", label: "연락처1", width: 160 },
  { key: "phone2", label: "연락처2", width: 160 },
  { key: "contractAddress", label: "계약자주소", width: 360 },
  { key: "itemName", label: "품목명", width: 260 },
  { key: "shippingDate", label: "택배발송일", width: 130 },
  { key: "startDate", label: "시작일", width: 130 },
  { key: "shipmentDate", label: "출고일자", width: 130 },
  { key: "boxCount", label: "박스수량", width: 90 },
  { key: "zipCode", label: "우편번호", width: 100 },
  { key: "blankX1", label: "X", width: 80 },
  { key: "blankX2", label: "X", width: 80 },
  { key: "blankX3", label: "X", width: 80 },
  { key: "memo", label: "메모", width: 260 },
  { key: "originalInvoiceNo", label: "원송장번호", width: 130 },
];

export type SpecificDateShipmentRow = {
  id: string;
  checked: boolean;
  data: Record<string, string>;
};

export function createEmptySpecificDateShipmentRow(index: number): SpecificDateShipmentRow {
  return {
    id: `empty-${index}`,
    checked: false,
    data: SPECIFIC_DATE_SHIPMENT_COLUMNS.reduce<Record<string, string>>((acc, col) => {
      if (col.key === "checked") return acc;
      acc[col.key] = "";
      return acc;
    }, {}),
  };
}
