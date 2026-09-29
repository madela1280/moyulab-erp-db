// app/views/lotteShipment/service.ts

export type LotteShipmentRow = {
  운송장번호: string;
  주문번호: string;
  수하인명: string;
  수하인전화번호: string;
  수하인주소: string;
  기기번호: string;
  등록일자: string | null;
  스캔일시: string | null;
  전송상태: "전송완료" | "미전송";
};

export async function fetchLotteShipments(): Promise<LotteShipmentRow[]> {
  const res = await fetch("/api/lotte-shipment", { cache: "no-store" });
  if (!res.ok) throw new Error("롯데택배 목록을 불러오지 못했습니다.");
  const data = await res.json();
  return data.rows ?? [];
}

export async function deleteLotteShipments(ids: string[]): Promise<void> {
  const res = await fetch("/api/lotte-shipment", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error("삭제하지 못했습니다.");
}

export type SendToUnifiedResult = {
  sentCount: number;
  sentInvoiceNos: string[];
  skippedInvoiceNos: string[];
  skippedReasons: Record<string, string>;
};

export async function sendLotteShipmentsToUnified(ids: string[]): Promise<SendToUnifiedResult> {
  const res = await fetch("/api/lotte-shipment/send-to-unified", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error("전송하지 못했습니다.");
  return res.json();
}

export type ScanResult = {
  found: boolean;
  row?: {
    운송장번호: string;
    수하인명: string;
    수하인전화번호: string;
    수하인주소: string;
  };
  sendStatus?: "SENT" | "ALREADY_SENT" | "AMBIGUOUS_MATCH" | "NO_MATCH";
};

export async function scanLotteShipment(invoiceNo: string): Promise<ScanResult> {
  const res = await fetch("/api/lotte-shipment/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invoiceNo }),
  });
  if (!res.ok) throw new Error("스캔 처리하지 못했습니다.");
  return res.json();
}
