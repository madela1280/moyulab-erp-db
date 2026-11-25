// app/api/manuals/_lib/ensureManualTable.ts

import { query } from "@/lib/db";

export async function ensureManualTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS manuals (
      id SERIAL PRIMARY KEY,
      category TEXT NOT NULL,
      subcategory TEXT NOT NULL DEFAULT '',
      detail TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      images JSONB NOT NULL DEFAULT '[]'::jsonb,
      keywords TEXT NOT NULL DEFAULT '',
      order_index INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(category, subcategory, detail)
    )
  `);
}
