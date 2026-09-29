// app/api/lotte-shipment/_lib/lotteShipmentService.ts
//
// 롯데택배 조회 화면 전용 로직.
// - 목록 조회 / 삭제 / 통합관리로 전송(매칭)
// - UnifiedGrid.tsx / sync-engine.ts / lock-engine.ts 는 전혀 사용하지 않음(완전 별도 배치 기능).

import { Pool } from "pg";
import { buildUnifiedCellChangeItems, recordUnifiedChangeHistory } from "@/unified/change-history/serverChangeHistory";

export const SEND_BATCH_MAX = 300;

const pool =
  (globalThis as any).__lotteShipmentPool ||
  new Pool({
    connectionString: process.env.DATABASE_URL,
  });

(globalThis as any).__lotteShipmentPool = pool;

function normalizeString(v: any) {
  return String(v ?? "").trim();
}

export type LotteShipmentRow = {
  운송장번호: string;
  주문번호: string;
  수하인명: string;
  수하인전화번호: string;
  수하인주소: string;
  기기번호: string;
  등록일자: string | null;
  스캔일시: string | null;
  전송상태: "전송완료" | "미전송";
};

export async function listLotteShipments(): Promise<LotteShipmentRow[]> {
  const r = await pool.query(
    `
    SELECT 운송장번호, 주문번호, 수하인명, 수하인전화번호, 수하인주소, 기기번호, 스캔일시, scraped_at, matched_unified_id
    FROM lotte_shipment_data
    ORDER BY scraped_at DESC
    `
  );

  return (r.rows || []).map((row: any) => ({
    운송장번호: normalizeString(row.운송장번호),
    주문번호: normalizeString(row.주문번호),
    수하인명: normalizeString(row.수하인명),
    수하인전화번호: normalizeString(row.수하인전화번호),
    수하인주소: normalizeString(row.수하인주소),
    기기번호: normalizeString(row.기기번호),
    등록일자: row.scraped_at ? new Date(row.scraped_at).toISOString() : null,
    스캔일시: row.스캔일시 ? new Date(row.스캔일시).toISOString() : null,
    전송상태: row.matched_unified_id ? "전송완료" : "미전송",
  }));
}

export async function deleteLotteShipments(invoiceNos: string[]): Promise<{ deletedCount: number }> {
  const safe = Array.from(new Set(invoiceNos.map(normalizeString).filter(Boolean)));
  if (!safe.length) return { deletedCount: 0 };

  const r = await pool.query(`DELETE FROM lotte_shipment_data WHERE 운송장번호 = ANY($1::text[])`, [safe]);
  return { deletedCount: r.rowCount ?? 0 };
}

export type SendResult = {
  sentCount: number;
  sentInvoiceNos: string[];
  skippedInvoiceNos: string[];
  skippedReasons: Record<string, "NOT_FOUND" | "ALREADY_SENT" | "AMBIGUOUS_MATCH" | "NO_MATCH">;
};

export async function sendLotteShipmentsToUnified(
  invoiceNos: string[],
  actor: { username: string | null; name: string | null }
): Promise<SendResult> {
  const safe = Array.from(new Set(invoiceNos.map(normalizeString).filter(Boolean))).slice(0, SEND_BATCH_MAX);

  const sentInvoiceNos: string[] = [];
  const skippedInvoiceNos: string[] = [];
  const skippedReasons: SendResult["skippedReasons"] = {};

  if (!safe.length) return { sentCount: 0, sentInvoiceNos, skippedInvoiceNos, skippedReasons };

  const client = await pool.connect();
  const changeItems: Array<ReturnType<typeof buildUnifiedCellChangeItems>[number]> = [];

  try {
    await client.query("BEGIN");

    for (const invoiceNo of safe) {
      const sel = await client.query(
        `SELECT 운송장번호, 수하인명, 수하인전화번호, 기기번호, 스캔일시, matched_unified_id
         FROM lotte_shipment_data WHERE 운송장번호 = $1 FOR UPDATE`,
        [invoiceNo]
      );
      const lotteRow = sel.rows?.[0];
      if (!lotteRow) {
        skippedInvoiceNos.push(invoiceNo);
        skippedReasons[invoiceNo] = "NOT_FOUND";
        continue;
      }
      if (lotteRow.matched_unified_id) {
        skippedInvoiceNos.push(invoiceNo);
        skippedReasons[invoiceNo] = "ALREADY_SENT";
        continue;
      }

      const 수취인명 = normalizeString(lotteRow.수하인명);
      const 연락처1 = normalizeString(lotteRow.수하인전화번호);

      const matchR = await client.query(
        `SELECT id, data FROM unified
         WHERE data->>'수취인명' = $1 AND data->>'연락처1' = $2
         FOR UPDATE`,
        [수취인명, 연락처1]
      );

      if (matchR.rows.length !== 1) {
        skippedInvoiceNos.push(invoiceNo);
        skippedReasons[invoiceNo] = matchR.rows.length === 0 ? "NO_MATCH" : "AMBIGUOUS_MATCH";
        continue;
      }

      const unifiedId = Number(matchR.rows[0].id);
      const beforeData = matchR.rows[0].data && typeof matchR.rows[0].data === "object" ? matchR.rows[0].data : {};

      const 기기번호 = normalizeString(lotteRow.기기번호);
      const 발송일 = lotteRow.스캔일시
        ? new Date(lotteRow.스캔일시).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);

      const afterData: Record<string, any> = {
        ...beforeData,
        택배발송일: 발송일,
      };
      if (기기번호) afterData.기기번호 = 기기번호;

      await client.query(`UPDATE unified SET data = $2::jsonb WHERE id = $1`, [unifiedId, JSON.stringify(afterData)]);

      await client.query(`UPDATE lotte_shipment_data SET matched_unified_id = $2 WHERE 운송장번호 = $1`, [
        invoiceNo,
        unifiedId,
      ]);

      changeItems.push(
        ...buildUnifiedCellChangeItems({
          unifiedId,
          beforeData,
          afterData,
          columnKeys: ["택배발송일", "기기번호"],
          actionType: "lotte_shipment_send",
        })
      );

      sentInvoiceNos.push(invoiceNo);
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  if (changeItems.length) {
    try {
      await recordUnifiedChangeHistory({
        action_type: "lotte_shipment_send",
        changed_by_username: actor.username,
        changed_by_name: actor.name,
        description: `롯데택배 -> 통합관리 전송 ${sentInvoiceNos.length}건`,
        items: changeItems,
      });
    } catch (err) {
      console.warn("lotte_shipment_send change history record failed (ignored):", err);
    }
  }

  return { sentCount: sentInvoiceNos.length, sentInvoiceNos, skippedInvoiceNos, skippedReasons };
}
