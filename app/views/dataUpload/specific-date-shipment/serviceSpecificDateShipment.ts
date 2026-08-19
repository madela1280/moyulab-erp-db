export type SpecificDateShipmentUnifiedSourceRow = {
  id: number;
  data: Record<string, any>;
};

export type FetchSpecificDateShipmentFromUnifiedResponse = {
  ok: boolean;
  message?: string;
  rows: SpecificDateShipmentUnifiedSourceRow[];
};

export async function fetchSpecificDateShipmentFromUnified(): Promise<FetchSpecificDateShipmentFromUnifiedResponse> {
  const r = await fetch(`/api/data-upload/specific-date-shipment/from-unified`, {
    method: "GET",
    cache: "no-store",
  });

  const j = (await r.json().catch(() => null)) as FetchSpecificDateShipmentFromUnifiedResponse | null;

  if (!r.ok) {
    throw new Error(j?.message || `FAILED(${r.status})`);
  }

  return {
    ok: Boolean(j?.ok),
    message: j?.message,
    rows: Array.isArray(j?.rows) ? j.rows : [],
  };
}

export type SubmitSpecificDateShipmentItem = {
  unifiedId: number;
  shippingDate: string;
};

export type SubmitSpecificDateShipmentResult = {
  ok: boolean;
  message?: string;
  successCount?: number;
  failedRows?: Array<{ unifiedId: number; message: string }>;
};

// ✅ 체크된 행의 택배발송일을 통합관리에 저장(전송)
export async function submitSpecificDateShipmentRows(
  items: SubmitSpecificDateShipmentItem[]
): Promise<SubmitSpecificDateShipmentResult> {
  if (!Array.isArray(items) || !items.length) {
    return { ok: false, message: "전송할 행이 없습니다.", successCount: 0, failedRows: [] };
  }

  const r = await fetch(`/api/data-upload/specific-date-shipment/submit`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });

  const j = (await r.json().catch(() => null)) as SubmitSpecificDateShipmentResult | null;

  if (!r.ok || j?.ok === false) {
    return {
      ok: false,
      message: j?.message || `FAILED(${r.status})`,
      successCount: j?.successCount || 0,
      failedRows: Array.isArray(j?.failedRows) ? j.failedRows : [],
    };
  }

  return {
    ok: true,
    message: j?.message || "전송이 완료되었습니다.",
    successCount: j?.successCount || items.length,
    failedRows: [],
  };
}
