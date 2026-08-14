import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

const DEFAULT_CS_BASE_URL = "https://return.moulab.kr";

type SubmitItem = {
  clientRowId: string;
  externalId: string;
  unifiedId: number;
  receivedAt: string;
  phone: string;
  renterName: string;
  returnModel: string;
  returnRequestDate: string;
  returnMemo: string;
  mismatchReason: string;
  processStatus: string;
};

function getCsBaseUrl() {
  return String(process.env.CS_SERVER_BASE_URL || DEFAULT_CS_BASE_URL).replace(/\/+$/, "");
}

function getCsApiHeaders(extra?: Record<string, string>) {
  const apiKey = String(
    process.env.CS_SERVER_API_KEY ||
      process.env.CS_ERP_API_KEY ||
      process.env.ERP_API_KEY ||
      ""
  ).trim();

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(extra || {}),
  };

  if (apiKey) {
    headers["x-erp-api-key"] = apiKey;
  }

  return headers;
}

function normalizeString(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeNumber(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.floor(n);
}

function extractSubmitItem(raw: any, index: number): SubmitItem {
  const data = raw?.data && typeof raw.data === "object" ? raw.data : {};
  const externalId = normalizeString(
    data.__externalId ||
      raw?.external_id ||
      raw?.id ||
      raw?.request_id ||
      raw?.return_request_id
  );

  return {
    clientRowId: normalizeString(raw?.id) || `row-${index}`,
    externalId,
    unifiedId: normalizeNumber(data.unifiedId || raw?.unified_id || raw?.unifiedId),
    receivedAt: normalizeString(data.__receivedAtRaw || raw?.received_at || raw?.receivedAt),
    phone: normalizeString(data.__phoneRaw || data.phone1 || raw?.phone),
    renterName: normalizeString(data.__renterNameRaw || data.recipientName || raw?.renter_name),
    returnModel: normalizeString(data.__returnModelRaw || data.product || raw?.return_model),
    returnRequestDate: normalizeString(
      data.returnRequestDate || raw?.pickup_preferred_date || raw?.returnRequestDate
    ),
    returnMemo: normalizeString(data.returnMemo || raw?.return_memo || raw?.returnMemo),
    mismatchReason: normalizeString(data.mismatchReason || raw?.mismatch_reason),
    processStatus: normalizeString(raw?.processStatus || data.processStatus || raw?.process_status),
  };
}

function buildFailRow(item: SubmitItem, message: string) {
  return {
    id: item.clientRowId,
    externalId: item.externalId || "",
    unifiedId: item.unifiedId || null,
    receivedAt: item.receivedAt,
    phone: item.phone,
    renterName: item.renterName,
    returnModel: item.returnModel,
    message,
  };
}

async function fetchUnifiedMap(ids: number[]) {
  if (!ids.length) return new Map<number, Record<string, any>>();

  const result = await query(
    `
    SELECT id, data
    FROM unified
    WHERE id = ANY($1::int[])
    `,
    [ids]
  );

  const map = new Map<number, Record<string, any>>();

  for (const row of result.rows || []) {
    const id = Number(row.id);
    const data = row.data && typeof row.data === "object" ? row.data : {};
    if (Number.isFinite(id) && id > 0) {
      map.set(id, data);
    }
  }

  return map;
}

async function patchUnifiedReturnRequest(item: SubmitItem) {
  const patch = {
    반납요청일: item.returnRequestDate || null,
    고객메모: item.returnMemo || null,
  };

  const result = await query(
    `
    UPDATE unified
    SET data = COALESCE(data, '{}'::jsonb) || $1::jsonb
    WHERE id = $2
    RETURNING id, data
    `,
    [JSON.stringify(patch), item.unifiedId]
  );

  return result.rows?.[0] || null;
}

async function updateCustomerServerStatus(items: SubmitItem[]) {
  const payloadItems = items.map((item) => ({
    external_id: item.externalId,
    id: item.externalId,
    request_id: item.externalId,
    return_request_id: item.externalId,
    received_at: item.receivedAt,
    phone: item.phone,
    renter_name: item.renterName,
    return_model: item.returnModel,
    mismatch_reason: item.mismatchReason,
    process_status: "전송",
  }));

  const response = await fetch(`${getCsBaseUrl()}/api/erp/return-requests/status`, {
    method: "POST",
    cache: "no-store",
    headers: getCsApiHeaders({
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({
      process_status: "전송",
      status: "전송",
      items: payloadItems,
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || data?.ok === false) {
    throw new Error(data?.message || `고객접수 서버 전송상태 변경 실패(${response.status})`);
  }

  const updatedCount = Number(data?.updatedCount || 0);

  if (updatedCount < items.length) {
    throw new Error(
      `고객접수 서버 전송상태 변경 일부 실패: 성공 ${updatedCount}건 / 요청 ${items.length}건`
    );
  }

  return data;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const rawRows: any[] = Array.isArray(body?.rows)
      ? body.rows
      : Array.isArray(body?.items)
        ? body.items
        : [];

    const items: SubmitItem[] = rawRows.map((row: any, index: number) =>
      extractSubmitItem(row, index)
    );

    if (!items.length) {
      return NextResponse.json(
        {
          ok: false,
          message: "전송할 체크 행이 없습니다.",
          successCount: 0,
          failedRows: [],
        },
        { status: 400 }
      );
    }

    const failedRows: Array<ReturnType<typeof buildFailRow>> = [];

    for (const item of items) {
      if (item.processStatus && item.processStatus !== "접수중") {
        failedRows.push(buildFailRow(item, "접수중 상태만 전송할 수 있습니다."));
        continue;
      }

      if (!item.unifiedId) {
        failedRows.push(buildFailRow(item, "통합관리 매칭 행이 없습니다."));
        continue;
      }

      if (!item.externalId && (!item.receivedAt || !item.phone || !item.renterName || !item.returnModel)) {
        failedRows.push(buildFailRow(item, "고객접수 행 식별 정보가 부족합니다."));
        continue;
      }

      if (!item.returnRequestDate) {
        failedRows.push(buildFailRow(item, "웹접수 반납요청일이 비어 있습니다."));
        continue;
      }

      if (item.mismatchReason) {
        failedRows.push(buildFailRow(item, "불일치사유가 있어 전송할 수 없습니다."));
      }
    }

    const seenUnifiedIds = new Set<number>();
    for (const item of items) {
      if (!item.unifiedId) continue;

      if (seenUnifiedIds.has(item.unifiedId)) {
        failedRows.push(buildFailRow(item, "동일한 통합관리 행이 중복 선택되었습니다."));
      }

      seenUnifiedIds.add(item.unifiedId);
    }

    if (failedRows.length) {
      return NextResponse.json(
        {
          ok: false,
          message: "전송할 수 없는 행이 포함되어 있습니다.",
          successCount: 0,
          failedRows,
        },
        { status: 400 }
      );
    }

    const unifiedIds = Array.from(new Set(items.map((item) => item.unifiedId)));
    const unifiedMap = await fetchUnifiedMap(unifiedIds);

    for (const item of items) {
      const unifiedData = unifiedMap.get(item.unifiedId);

      if (!unifiedData) {
        failedRows.push(buildFailRow(item, "통합관리 행을 찾을 수 없습니다."));
        continue;
      }

      const currentReturnRequestDate = normalizeString(unifiedData["반납요청일"]);

      if (currentReturnRequestDate) {
        failedRows.push(
          buildFailRow(
            item,
            `통합관리 반납요청일에 이미 값이 있습니다. (${currentReturnRequestDate})`
          )
        );
      }
    }

    if (failedRows.length) {
      return NextResponse.json(
        {
          ok: false,
          message: "통합관리 반납요청일이 비어 있는 행만 전송할 수 있습니다.",
          successCount: 0,
          failedRows,
        },
        { status: 409 }
      );
    }

    const savedRows = [];

    for (const item of items) {
      const saved = await patchUnifiedReturnRequest(item);

      if (!saved) {
        failedRows.push(buildFailRow(item, "통합관리 저장에 실패했습니다."));
        continue;
      }

      savedRows.push(saved);
    }

    if (failedRows.length) {
      return NextResponse.json(
        {
          ok: false,
          message: "일부 행의 통합관리 저장에 실패했습니다.",
          successCount: savedRows.length,
          failedRows,
        },
        { status: 500 }
      );
    }

    const statusResult = await updateCustomerServerStatus(items);

    return NextResponse.json({
      ok: true,
      message: "전송이 완료되었습니다.",
      successCount: items.length,
      failedRows: [],
      statusResult,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        message: e?.message || "반납접수 전송 처리에 실패했습니다.",
        successCount: 0,
        failedRows: [],
      },
      { status: 500 }
    );
  }
}