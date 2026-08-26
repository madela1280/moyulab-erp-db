// app/views/customerReception/packaging-order/columns.ts
//
// 포장재구매 그리드 컬럼 정의. 카카오 챗봇이 받은 원본 정보 그대로 보여준다.
// "확인"(체크박스)은 별도 고정 컬럼이라 여기 목록에는 없다(PackagingOrderGrid에서 항상 맨 앞에 그림).

export type PackagingOrderColumnType = "text" | "status";

export type PackagingOrderColumn = {
  key: string;
  label: string;
  width: number;
  type?: PackagingOrderColumnType; // 기본값 "text"
};

export type PackagingOrderRow = {
  id: string;
  status: string; // payment_orders.status 원본값('waiting' | 'matched' | 'confirmed' | 'expired' | 'canceled')
  data: Record<string, string>;
};

export const PACKAGING_ORDER_COLUMNS: PackagingOrderColumn[] = [
  { key: "status", label: "입금확인", width: 100, type: "status" },
  { key: "renter_name", label: "대여자명", width: 110 },
  { key: "phone1", label: "연락처1", width: 130 },
  { key: "phone2", label: "연락처2", width: 130 },
  { key: "shipping_address", label: "발송주소", width: 320 },
  { key: "item_name", label: "품목명", width: 160 },
  // 여기부터는 카톡 데이터가 아니라 직접 채워 넣는 칸(반납회수와 동일한 구성) — 롯데택배에 복사해 붙여넣기 위함
  { key: "pickupDate", label: "출고일자", width: 140 },
  { key: "boxCount", label: "박스수량", width: 90 },
  { key: "zipCode", label: "우편번호", width: 100 },
  { key: "blankX1", label: "X", width: 80 },
  { key: "blankX2", label: "X", width: 80 },
  { key: "blankX3", label: "X", width: 80 },
  { key: "memo", label: "메모", width: 260 },
];

/** "waiting"이 아니면 전부 "입금확인"으로 본다(문자로 매칭됐다는 뜻이므로) */
export function getPaymentStatusLabel(status: string): "입금대기" | "입금확인" {
  return status === "waiting" ? "입금대기" : "입금확인";
}

export function createEmptyPackagingOrderRow(index: number): PackagingOrderRow {
  return {
    id: `empty-${index}`,
    status: "waiting",
    data: {},
  };
}
