import { NextRequest, NextResponse } from "next/server";

const DEFAULT_CS_BASE_URL = "https://return.moulab.kr";

type DeleteItem = {
  clientRowId: string;
  externalId: string;
  receivedAt: string;
  phone: string;
  renterName: string;
  returnModel: string;
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

function extractDeleteItem(raw: any, index: number): DeleteItem {
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
    receivedAt: normalizeString(data.__receivedAtRaw || raw?.received_at || raw?.receivedAt),
    phone: normalizeString(data.__phoneRaw || data.phone1 || raw?.phone),
    renterName: normalizeString(data.__renterNameRaw || data.recipientName || raw?.renter_name),
    returnModel: normalizeString(data.__returnModelRaw || data.product || raw?.return_model),
    processStatus: normalizeString(raw?.processStatus || data.processStatus || raw?.process_status),
  };
}

function buildFailRow(item: DeleteItem, message: string) {
  return {
    id: item.clientRowId,
    externalId: item.externalId || "",
    receivedAt: item.receivedAt,
    phone: item.phone,
    renterName: item.renterName,
    returnModel: item.returnModel,
    message,
  };
}

async function updateCustomerServerStatus(items: DeleteItem[]) {
  const payloadItems = items.map((item) => ({
    external_id: item.externalId,
    id: item.externalId,
    request_id: item.externalId,
    return_request_id: item.externalId,
    received_at: item.receivedAt,
    phone: item.phone,
    renter_name: item.renterName,
    return_model: item.returnModel,
    process_status: "삭제",
  }));

  const response = await fetch(`${getCsBaseUrl()}/api/erp/return-requests/status`, {
    method: "POST",
    cache: "no-store",
    headers: getCsApiHeaders({
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({
      process_status: "삭제",
      status: "삭제",
      items: payloadItems,
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || data?.ok === false) {
    throw new Error(data?.message || `고객접수 서버 삭제상태 변경 실패(${response.status})`);
  }

  const updatedCount = Number(data?.updatedCount || 0);

  if (updatedCount < items.length) {
    throw new Error(
      `고객접수 서버 삭제상태 변경 일부 실패: 성공 ${updatedCount}건 / 요청 ${items.length}건`
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

    const items: DeleteItem[] = rawRows.map((row: any, index: number) =>
      extractDeleteItem(row, index)
    );

    if (!items.length) {
      return NextResponse.json(
        {
          ok: false,
          message: "삭제할 체크 행이 없습니다.",
          successCount: 0,
          failedRows: [],
        },
        { status: 400 }
      );
    }

    const failedRows: Array<ReturnType<typeof buildFailRow>> = [];

    for (const item of items) {
      // 반납접수(접수중) 화면에서만 삭제 버튼을 노출하므로, 접수중이 아닌 행은 방어적으로 막는다.
      if (item.processStatus && item.processStatus !== "접수중") {
        failedRows.push(buildFailRow(item, "접수중 상태만 삭제할 수 있습니다."));
        continue;
      }

      if (!item.externalId && (!item.receivedAt || !item.phone || !item.renterName || !item.returnModel)) {
        failedRows.push(buildFailRow(item, "고객접수 행 식별 정보가 부족합니다."));
      }
    }

    if (failedRows.length) {
      return NextResponse.json(
        {
          ok: false,
          message: "삭제할 수 없는 행이 포함되어 있습니다.",
          successCount: 0,
          failedRows,
        },
        { status: 400 }
      );
    }

    // 실제 삭제가 아니라 외부 고객접수 서버의 process_status만 "삭제"로 변경한다.
    // (리스트 화면 전체 이력에는 계속 남는다.)
    const statusResult = await updateCustomerServerStatus(items);

    return NextResponse.json({
      ok: true,
      message: "삭제 처리가 완료되었습니다.",
      successCount: items.length,
      failedRows: [],
      statusResult,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        message: e?.message || "반납접수 삭제 처리에 실패했습니다.",
        successCount: 0,
        failedRows: [],
      },
      { status: 500 }
    );
  }
}
