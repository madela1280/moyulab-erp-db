import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

type UnifiedRow = {
  id: number;
  data: Record<string, any> | null;
};

const DEFAULT_CS_BASE_URL = "https://return.moulab.kr";

function normalizeDateText(v: unknown) {
  return String(v ?? "").trim();
}

function normalizeString(v: unknown) {
  return String(v ?? "").trim();
}

function normalizePhone(v: unknown) {
  return normalizeString(v).replace(/\D/g, "");
}

function normalizeText(v: unknown) {
  return normalizeString(v).replace(/\s+/g, "").toLowerCase();
}

function isSamePhone(a: unknown, b: unknown) {
  const aa = normalizePhone(a);
  const bb = normalizePhone(b);
  if (!aa || !bb) return false;
  return aa === bb;
}

function isSameText(a: unknown, b: unknown) {
  const aa = normalizeText(a);
  const bb = normalizeText(b);
  if (!aa || !bb) return false;
  return aa === bb;
}

function getCsBaseUrl() {
  return String(process.env.CS_SERVER_BASE_URL || DEFAULT_CS_BASE_URL).replace(/\/+$/, "");
}

function getCsApiHeaders() {
  const apiKey = String(
    process.env.CS_SERVER_API_KEY ||
      process.env.CS_ERP_API_KEY ||
      process.env.ERP_API_KEY ||
      ""
  ).trim();

  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) headers["x-erp-api-key"] = apiKey;
  return headers;
}

/**
 * 이미 롯데택배로 정상 접수(예약번호 있음)된 phone+제품 조합만 뽑아온다.
 * 반납회수 목록에서 이 조합과 일치하는 통합관리 행은 빼서 중복 수기접수를 막는다
 * (대표님 지시, 2026-09-08). CS서버 조회 실패 시에는 필터링을 건너뛴다 —
 * 반납회수 자체가 이 부가 기능 때문에 막히면 안 된다.
 */
async function fetchBookedPhoneProductPairs(): Promise<Array<{ phone: string; product: string }>> {
  try {
    const response = await fetch(`${getCsBaseUrl()}/api/erp/return-requests`, {
      method: "GET",
      cache: "no-store",
      headers: getCsApiHeaders(),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.message || `고객접수 서버 조회 실패(${response.status})`);
    }

    const rows: any[] = Array.isArray(data?.rows) ? data.rows : [];

    return rows
      .filter((row) => normalizeString(row?.lotte_status) === "booked")
      .map((row) => ({
        phone: normalizePhone(row?.phone),
        product: normalizeText(row?.return_model),
      }))
      .filter((pair) => pair.phone && pair.product);
  } catch (e) {
    console.error("fetchBookedPhoneProductPairs failed (필터링 건너뜀):", e);
    return [];
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const returnRequestDate = normalizeDateText(searchParams.get("date"));

    if (!returnRequestDate) {
      return NextResponse.json(
        {
          ok: false,
          message: "반납요청일을 입력하세요.",
          rows: [],
        },
        { status: 400 }
      );
    }

    const result = await query(
      `
      SELECT id, data
      FROM unified
      WHERE TRIM(COALESCE(data->>'반납요청일', '')) = $1
        AND TRIM(COALESCE(data->>'반납완료일', '')) = ''
      ORDER BY id ASC
      `,
      [returnRequestDate]
    );

    const allRows = Array.isArray((result as any)?.rows) ? ((result as any).rows as UnifiedRow[]) : [];

    // 이미 롯데택배로 정상 접수된 건은 빼고 내려준다 — 안 그러면 수기접수로 중복접수하게 된다.
    const bookedPairs = await fetchBookedPhoneProductPairs();

    const rows = bookedPairs.length
      ? allRows.filter((row) => {
          const data = row.data ?? {};
          const phone = normalizePhone(data["연락처1"]);
          const product = normalizeText(data["제품"]);

          const alreadyBooked = bookedPairs.some(
            (pair) => isSamePhone(pair.phone, phone) && isSameText(pair.product, product)
          );

          return !alreadyBooked;
        })
      : allRows;

    return NextResponse.json({
      ok: true,
      date: returnRequestDate,
      rows: rows.map((row) => ({
        id: row.id,
        data: row.data ?? {},
      })),
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        message: e?.message || "반납회수 데이터를 불러오지 못했습니다.",
        rows: [],
      },
      { status: 500 }
    );
  }
}