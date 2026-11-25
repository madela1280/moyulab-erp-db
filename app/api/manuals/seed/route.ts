// app/api/manuals/seed/route.ts
//
// 메뉴얼 초기 데이터 삽입(1회성, idempotent). 이미 존재하는 노드는 덮어쓰지 않는다.

import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureManualTable } from "../_lib/ensureManualTable";
import { MANUAL_SEED } from "./_seedData";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await ensureManualTable();

    let inserted = 0;
    let skipped = 0;

    for (let i = 0; i < MANUAL_SEED.length; i++) {
      const entry = MANUAL_SEED[i];
      const subcategory = entry.subcategory ?? "";
      const detail = entry.detail ?? "";

      const existing = await query(
        `SELECT id FROM manuals WHERE category = $1 AND subcategory = $2 AND detail = $3`,
        [entry.category, subcategory, detail]
      );

      if (existing.rows.length > 0) {
        skipped++;
        continue;
      }

      await query(
        `INSERT INTO manuals (category, subcategory, detail, title, body, images, keywords, order_index, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, NOW())`,
        [
          entry.category,
          subcategory,
          detail,
          entry.title,
          entry.body,
          JSON.stringify(entry.images ?? []),
          entry.keywords ?? "",
          i,
        ]
      );
      inserted++;
    }

    return NextResponse.json({ ok: true, inserted, skipped, total: MANUAL_SEED.length });
  } catch (e) {
    console.error("POST /api/manuals/seed error:", e);
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}
