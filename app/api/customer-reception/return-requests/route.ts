import { NextRequest, NextResponse } from "next/server";

const DEFAULT_CS_BASE_URL = "https://return.moulab.kr";

function getCsBaseUrl() {
  return String(process.env.CS_SERVER_BASE_URL || DEFAULT_CS_BASE_URL).replace(/\/+$/, "");
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const status = String(url.searchParams.get("status") || "").trim();

    const targetUrl = new URL(`${getCsBaseUrl()}/api/erp/return-requests`);

    if (status) {
      targetUrl.searchParams.set("status", status);
    }

    const response = await fetch(targetUrl.toString(), {
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: data?.message || `고객접수 서버 조회 실패(${response.status})`,
          rows: [],
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      ok: true,
      rows: Array.isArray(data?.rows) ? data.rows : Array.isArray(data) ? data : [],
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        message: e?.message || "반납접수 데이터를 불러오지 못했습니다.",
        rows: [],
      },
      { status: 500 }
    );
  }
}