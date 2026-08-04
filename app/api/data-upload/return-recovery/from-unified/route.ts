import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

type UnifiedRow = {
  id: number;
  data: Record<string, any> | null;
};

function normalizeDateText(v: unknown) {
  return String(v ?? "").trim();
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
      ORDER BY id ASC
      `,
      [returnRequestDate]
    );

    const rows = Array.isArray((result as any)?.rows) ? ((result as any).rows as UnifiedRow[]) : [];

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
}import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

type UnifiedRow = {
  id: number;
  data: Record<string, any> | null;
};

function normalizeDateText(v: unknown) {
  return String(v ?? "").trim();
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
      ORDER BY id ASC
      `,
      [returnRequestDate]
    );

    const rows = Array.isArray((result as any)?.rows) ? ((result as any).rows as UnifiedRow[]) : [];

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