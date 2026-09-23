// scripts/lotte-alps-rpa/save.mjs
//
// 스크랩한 롯데 출고데이터를 저장하고, 마지막으로 가져온 시점을 기록한다.
// (통합관리 매칭/택배발송일 자동입력은 별도 기능 — 이 스크립트는 원본 데이터 수집까지만 담당)

import { Client } from "pg";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS lotte_shipment_data (
    운송장번호 text PRIMARY KEY,
    주문번호 text,
    수하인명 text,
    수하인전화번호 text,
    수하인주소 text,
    scraped_at timestamptz NOT NULL DEFAULT now(),
    matched_unified_id integer
  );

  CREATE TABLE IF NOT EXISTS lotte_shipment_pull_state (
    id integer PRIMARY KEY DEFAULT 1,
    last_pulled_to_date text,
    last_pulled_at timestamptz,
    CONSTRAINT single_row CHECK (id = 1)
  );
`;

export async function saveShipmentRows(rows, { toDate } = {}) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query(SCHEMA);
    await client.query("BEGIN");

    let savedCount = 0;
    for (const row of rows) {
      await client.query(
        `
        INSERT INTO lotte_shipment_data (운송장번호, 주문번호, 수하인명, 수하인전화번호, 수하인주소, scraped_at)
        VALUES ($1, $2, $3, $4, $5, now())
        ON CONFLICT (운송장번호) DO UPDATE SET
          주문번호 = EXCLUDED.주문번호,
          수하인명 = EXCLUDED.수하인명,
          수하인전화번호 = EXCLUDED.수하인전화번호,
          수하인주소 = EXCLUDED.수하인주소,
          scraped_at = now()
        `,
        [row.운송장번호, row.주문번호, row.수하인명, row.수하인전화번호, row.수하인주소]
      );
      savedCount++;
    }

    if (toDate) {
      await client.query(
        `
        INSERT INTO lotte_shipment_pull_state (id, last_pulled_to_date, last_pulled_at)
        VALUES (1, $1, now())
        ON CONFLICT (id) DO UPDATE SET
          last_pulled_to_date = EXCLUDED.last_pulled_to_date,
          last_pulled_at = now()
        `,
        [toDate]
      );
    }

    await client.query("COMMIT");
    return { savedCount };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }
}

export async function getLastPulledDate() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query(SCHEMA);
    const r = await client.query(`SELECT last_pulled_to_date FROM lotte_shipment_pull_state WHERE id = 1`);
    return r.rows?.[0]?.last_pulled_to_date ?? null;
  } finally {
    await client.end();
  }
}

// ✅ 스캔 시 이미 저장된 데이터에서 먼저 찾을 때 쓰는 조회 함수
export async function findShipmentByInvoiceNo(invoiceNo) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query(SCHEMA);
    const r = await client.query(
      `SELECT 운송장번호, 주문번호, 수하인명, 수하인전화번호, 수하인주소 FROM lotte_shipment_data WHERE 운송장번호 = $1`,
      [invoiceNo]
    );
    return r.rows?.[0] ?? null;
  } finally {
    await client.end();
  }
}
