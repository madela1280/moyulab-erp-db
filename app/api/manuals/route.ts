// app/api/manuals/route.ts
//
// 메뉴얼 카테고리 콘텐츠 CRUD.
// - GET ?tree=1          : 좌측 트리용 목록(가벼운 필드만)
// - GET ?search=keyword  : 제목/본문/키워드 검색
// - GET ?category=&subcategory=&detail= : 특정 노드의 전체 콘텐츠
// - POST                 : upsert (category+subcategory+detail 기준)

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureManualTable } from "./_lib/ensureManualTable";

export const dynamic = "force-dynamic";

function snippet(text: string, keyword: string, len = 60): string {
  const idx = text.toLowerCase().indexOf(keyword.toLowerCase());
  if (idx === -1) return text.slice(0, len);
  const start = Math.max(0, idx - 20);
  return text.slice(start, start + len);
}

export async function GET(req: NextRequest) {
  try {
    await ensureManualTable();

    const { searchParams } = new URL(req.url);
    const tree = searchParams.get("tree");
    const search = searchParams.get("search");
    const category = searchParams.get("category");
    const subcategory = searchParams.get("subcategory");
    const detail = searchParams.get("detail");

    if (search) {
      const kw = `%${search}%`;
      const result = await query(
        `SELECT id, category, subcategory, detail, title, body, keywords
         FROM manuals
         WHERE title ILIKE $1 OR body ILIKE $1 OR keywords ILIKE $1
         ORDER BY order_index, id
         LIMIT 50`,
        [kw]
      );
      const rows = result.rows.map((r: any) => ({
        id: r.id,
        category: r.category,
        subcategory: r.subcategory,
        detail: r.detail,
        title: r.title,
        snippet: snippet(r.body || r.title || "", search),
      }));
      return NextResponse.json({ ok: true, results: rows });
    }

    if (category !== null) {
      const result = await query(
        `SELECT id, category, subcategory, detail, title, body, images, keywords
         FROM manuals
         WHERE category = $1 AND subcategory = $2 AND detail = $3`,
        [category, subcategory ?? "", detail ?? ""]
      );
      const row = result.rows?.[0];
      if (!row) {
        return NextResponse.json({ ok: true, item: null });
      }
      return NextResponse.json({
        ok: true,
        item: {
          id: row.id,
          category: row.category,
          subcategory: row.subcategory,
          detail: row.detail,
          title: row.title,
          body: row.body,
          images: Array.isArray(row.images) ? row.images : [],
          keywords: row.keywords,
        },
      });
    }

    // tree=1 또는 기본: 전체 노드 목록(가벼운 필드)
    const result = await query(
      `SELECT id, category, subcategory, detail, title, order_index
       FROM manuals
       ORDER BY order_index, id`
    );
    return NextResponse.json({ ok: true, nodes: result.rows });
  } catch (e) {
    console.error("GET /api/manuals error:", e);
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureManualTable();

    const body = await req.json().catch(() => null);
    if (!body || typeof body.category !== "string" || !body.category.trim()) {
      return NextResponse.json({ ok: false, error: "category_required" }, { status: 400 });
    }

    const category = body.category.trim();
    const subcategory = typeof body.subcategory === "string" ? body.subcategory.trim() : "";
    const detail = typeof body.detail === "string" ? body.detail.trim() : "";
    const title = typeof body.title === "string" ? body.title : "";
    const content = typeof body.body === "string" ? body.body : "";
    const images = Array.isArray(body.images) ? body.images : [];
    const keywords = typeof body.keywords === "string" ? body.keywords : "";
    const orderIndex = Number.isFinite(body.orderIndex) ? body.orderIndex : 0;

    const result = await query(
      `INSERT INTO manuals (category, subcategory, detail, title, body, images, keywords, order_index, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, NOW())
       ON CONFLICT (category, subcategory, detail) DO UPDATE SET
         title = $4,
         body = $5,
         images = $6::jsonb,
         keywords = $7,
         order_index = $8,
         updated_at = NOW()
       RETURNING id`,
      [category, subcategory, detail, title, content, JSON.stringify(images), keywords, orderIndex]
    );

    return NextResponse.json({ ok: true, id: result.rows[0].id });
  } catch (e) {
    console.error("POST /api/manuals error:", e);
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}
