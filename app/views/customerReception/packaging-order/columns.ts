// app/views/customerReception/packaging-order/columns.ts
//
// 포장재구매 그리드 컬럼 정의. 카카오 챗봇이 받은 원본 정보 그대로 보여준다.

export type PackagingOrderColumn = {
  key: string;
  label: string;
  width: number;
};

export type PackagingOrderRow = {
  id: string;
  data: Record<string, string>;
};

export const PACKAGING_ORDER_COLUMNS: PackagingOrderColumn[] = [
  { key: "renter_name", label: "대여자명", width: 110 },
  { key: "phone1", label: "연락처1", width: 130 },
  { key: "phone2", label: "연락처2", width: 130 },
  { key: "shipping_address", label: "발송주소", width: 320 },
  { key: "item_name", label: "품목명", width: 160 },
];

export function createEmptyPackagingOrderRow(index: number): PackagingOrderRow {
  return {
    id: `empty-${index}`,
    data: {},
  };
}
