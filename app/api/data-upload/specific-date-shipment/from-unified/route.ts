import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

type UnifiedRow = {
  id: number;
  data: Record<string, any> | null;
};

// ✅ 특정일자출고 대상: 택배발송일 / 반납요청일 / 반납완료일이 전부 비어 있는 통합관리 행
export async function GET(_req: NextRequest) {
  try {
    const result = await query(
      `
      SELECT id, data
      FROM unified
      WHERE TRIM(COALESCE(data->>'택배발송일', '')) = ''
        AND TRIM(COALESCE(data->>'반납요청일', '')) = ''
        AND TRIM(COALESCE(data->>'반납완료일', '')) = ''
      ORDER BY id ASC
      `
    );

    const rows = Array.isArray((result as any)?.rows) ? ((result as any).rows as UnifiedRow[]) : [];

    return NextResponse.json({
      ok: true,
      rows: rows.map((row) => ({
        id: row.id,
        data: row.data ?? {},
      })),
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        message: e?.message || "특정일자출고 데이터를 불러오지 못했습니다.",
        rows: [],
      },
      { status: 500 }
    );
  }
}
