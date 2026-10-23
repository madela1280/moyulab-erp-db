// app/views/lotteShipment/service.ts

export type LotteShipmentRow = {
  운송장번호: string;
  주문번호: string;
  수하인명: string;
  수하인전화번호: string;
  수하인주소: string;
  기기번호: string;
  집하일자: string | null;
  스캔일시: string | null;
  전송상태: "전송완료" | "미전송";
  상품명: string;
  이카운트전송상태: "전송완료" | "미전송" | "미매핑";
};

export async function fetchLotteShipments(): Promise<LotteShipmentRow[]> {
  const res = await fetch("/api/lotte-shipment", { cache: "no-store" });
  if (!res.ok) throw new Error("롯데택배 목록을 불러오지 못했습니다.");
  const data = await res.json();
  return data.rows ?? [];
}

export async function updateLotteShipmentProductName(invoiceNo: string, 상품명: string): Promise<void> {
  const res = await fetch("/api/lotte-shipment/update-product-name", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invoiceNo, 상품명 }),
  });
  if (!res.ok) throw new Error("상품명을 수정하지 못했습니다.");
}

export async function updateLotteShipmentDeviceNo(invoiceNo: string, 기기번호: string): Promise<void> {
  const res = await fetch("/api/lotte-shipment/update-device-no", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invoiceNo, 기기번호 }),
  });
  if (!res.ok) throw new Error("기기번호를 수정하지 못했습니다.");
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

export type EcountSendResult = {
  sentCount: number;
  sentInvoiceNos: string[];
  skippedInvoiceNos: string[];
  skippedReasons: Record<string, "NOT_FOUND" | "ALREADY_SENT" | "NOT_SCANNED" | "PRODUCT_NOT_MATCHED">;
};

export async function sendLotteShipmentsToEcount(ids: string[]): Promise<EcountSendResult> {
  const res = await fetch("/api/lotte-shipment/send-to-ecount", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error("이카운트로 전송하지 못했습니다.");
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

export async function fetchLotteShipmentDeviceNo(invoiceNo: string): Promise<string> {
  const res = await fetch(`/api/lotte-shipment/scan/device-no?invoiceNo=${encodeURIComponent(invoiceNo)}`, {
    cache: "no-store",
  });
  if (!res.ok) return "";
  const data = await res.json();
  return data.deviceNo || "";
}

export type RecentScanRow = {
  운송장번호: string;
  수하인명: string;
  기기번호: string;
  스캔일시: string;
  전송상태: "전송완료" | "미전송";
};

export async function fetchRecentLotteScans(): Promise<RecentScanRow[]> {
  const res = await fetch("/api/lotte-shipment/scan/recent", { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  return data.rows ?? [];
}
