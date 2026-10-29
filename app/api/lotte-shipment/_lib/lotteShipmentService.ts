// app/api/lotte-shipment/_lib/lotteShipmentService.ts
//
// 롯데택배 조회 화면 전용 로직.
// - 목록 조회 / 삭제 / 통합관리로 전송(매칭)
// - UnifiedGrid.tsx / sync-engine.ts / lock-engine.ts 는 전혀 사용하지 않음(완전 별도 배치 기능).

import { Pool } from "pg";
import { buildUnifiedCellChangeItems, recordUnifiedChangeHistory } from "@/unified/change-history/serverChangeHistory";
import { triggerLotteFetchOnce } from "@/api/lotte-shipment/_lib/triggerLotteFetch";
import { matchAmoenaLines, AMOENA_CUST, AMOENA_WH_CD } from "@/api/lotte-shipment/_lib/ecountAmoenaMatcher";
import { registerEcountSale } from "@/api/lotte-shipment/_lib/ecountSaveSale";
import { toEcountIoDate } from "@/api/market-sales/_lib/marketSalesDate";

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
  집하일자: string | null;
  스캔일시: string | null;
  전송상태: "전송완료" | "미전송";
  상품명: string;
  // ✅ 이카운트 매출 전송 상태. 상품명 -> 이카운트 품목코드 매핑표가 아직 없어서
  //    지금은 "전송완료"가 나올 일이 없고 전부 미전송/미매핑 상태로만 계산된다(매핑 추가 예정).
  이카운트전송상태: "전송완료" | "미전송" | "미매핑";
};

export async function listLotteShipments(): Promise<LotteShipmentRow[]> {
  // ✅ 집하일자는 "날짜만" 있는 값이라 JS Date로 왕복시키면 서버 시간대(KST, UTC+9) 때문에
  //    UTC 변환 시 하루 밀리는 문제가 있었음(2026-10-08 → 2026-10-07로 표시됨) — SQL에서
  //    바로 텍스트로 캐스팅해서 시간대 변환 자체를 거치지 않게 한다.
  const r = await pool.query(
    `
    SELECT 운송장번호, 주문번호, 수하인명, 수하인전화번호, 수하인주소, 기기번호, 스캔일시, 상품명,
           집하일자::text AS 집하일자,
           matched_unified_id, 이카운트전표번호
    FROM lotte_shipment_data
    ORDER BY 집하일자 DESC NULLS LAST, scraped_at DESC
    `
  );

  return (r.rows || []).map((row: any) => ({
    운송장번호: normalizeString(row.운송장번호),
    주문번호: normalizeString(row.주문번호),
    수하인명: normalizeString(row.수하인명),
    수하인전화번호: normalizeString(row.수하인전화번호),
    수하인주소: normalizeString(row.수하인주소),
    기기번호: normalizeString(row.기기번호),
    집하일자: row.집하일자 || null,
    스캔일시: row.스캔일시 ? new Date(row.스캔일시).toISOString() : null,
    전송상태: row.matched_unified_id ? "전송완료" : "미전송",
    상품명: normalizeString(row.상품명),
    이카운트전송상태: row.이카운트전표번호
      ? "전송완료"
      : row.스캔일시
      ? "미매핑"
      : "미전송",
  }));
}

export type UpdateProductNameResult = { ok: true } | { ok: false; reason: "NOT_FOUND" | "ALREADY_SENT" };

// ✅ 이카운트 매칭 실패 건을 사용자가 상품명을 직접 고쳐서 재전송할 수 있게. 이미 전송완료된 건은 금지
//    (전표가 이미 생성된 뒤 상품명을 바꾸면 전표 내용과 안 맞게 되므로).
export async function updateLotteShipmentProductName(
  invoiceNoRaw: string,
   상품명Raw: string
): Promise<UpdateProductNameResult> {
  const invoiceNo = normalizeString(invoiceNoRaw);
  const 상품명 = normalizeString(상품명Raw);
  if (!invoiceNo) return { ok: false, reason: "NOT_FOUND" };

  const r = await pool.query(`SELECT 이카운트전표번호 FROM lotte_shipment_data WHERE 운송장번호 = $1`, [invoiceNo]);
  const row = r.rows?.[0];
  if (!row) return { ok: false, reason: "NOT_FOUND" };
  if (row.이카운트전표번호) return { ok: false, reason: "ALREADY_SENT" };

  await pool.query(`UPDATE lotte_shipment_data SET 상품명 = $2 WHERE 운송장번호 = $1`, [invoiceNo, 상품명]);
  return { ok: true };
}

export type UpdateDeviceNoResult = { ok: true } | { ok: false; reason: "NOT_FOUND" };

// ✅ 기기번호를 수동으로 고칠 때(RFID 오인식 등). 이미 통합관리로 전송된 건이면 그 unified 행의
//    기기번호도 같이 갱신한다(registerRfidTagToLatestScan의 "이미 전송된 건" 분기와 동일한 방식).
export async function updateLotteShipmentDeviceNo(
  invoiceNoRaw: string,
  기기번호Raw: string,
  actor: { username: string | null; name: string | null }
): Promise<UpdateDeviceNoResult> {
  const invoiceNo = normalizeString(invoiceNoRaw);
  const 기기번호 = normalizeString(기기번호Raw);
  if (!invoiceNo) return { ok: false, reason: "NOT_FOUND" };

  const client = await pool.connect();
  let changeItems: ReturnType<typeof buildUnifiedCellChangeItems> = [];

  try {
    await client.query("BEGIN");

    const sel = await client.query(
      `SELECT matched_unified_id FROM lotte_shipment_data WHERE 운송장번호 = $1 FOR UPDATE`,
      [invoiceNo]
    );
    const row = sel.rows?.[0];
    if (!row) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "NOT_FOUND" };
    }

    await client.query(`UPDATE lotte_shipment_data SET 기기번호 = $2 WHERE 운송장번호 = $1`, [invoiceNo, 기기번호]);

    const matchedUnifiedId = row.matched_unified_id;
    if (matchedUnifiedId) {
      const unifiedSel = await client.query(`SELECT data FROM unified WHERE id = $1 FOR UPDATE`, [matchedUnifiedId]);
      const beforeData = unifiedSel.rows?.[0]?.data && typeof unifiedSel.rows[0].data === "object" ? unifiedSel.rows[0].data : {};
      const afterData = { ...beforeData, 기기번호 };
      await client.query(`UPDATE unified SET data = $2::jsonb WHERE id = $1`, [matchedUnifiedId, JSON.stringify(afterData)]);

      changeItems = buildUnifiedCellChangeItems({
        unifiedId: Number(matchedUnifiedId),
        beforeData,
        afterData,
        columnKeys: ["기기번호"],
        actionType: "lotte_shipment_send",
      });
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
        description: `롯데택배 기기번호 수동 수정 -> 통합관리 반영 (${invoiceNo})`,
        items: changeItems,
      });
    } catch (err) {
      console.warn("lotte_shipment_send(device-no edit) change history record failed (ignored):", err);
    }
  }

  return { ok: true };
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

type MatchAndSendOutcome =
  | { status: "SENT"; unifiedId: number; changeItems: ReturnType<typeof buildUnifiedCellChangeItems> }
  | { status: "NOT_FOUND" | "ALREADY_SENT" | "AMBIGUOUS_MATCH" | "NO_MATCH" };

// ✅ 한 건(운송장번호 1개)에 대해 통합관리 매칭+반영을 시도하는 공용 로직.
//    bulk 전송(sendLotteShipmentsToUnified)과 스캔(scanLotteShipment) 양쪽에서 재사용.
//    호출자가 이미 연 트랜잭션의 client를 그대로 넘겨받는다(자체적으로 BEGIN/COMMIT 하지 않음).
async function matchAndSendOne(client: any, invoiceNo: string): Promise<MatchAndSendOutcome> {
  const sel = await client.query(
    `SELECT 운송장번호, 수하인명, 수하인전화번호, 기기번호, 스캔일시, matched_unified_id
     FROM lotte_shipment_data WHERE 운송장번호 = $1 FOR UPDATE`,
    [invoiceNo]
  );
  const lotteRow = sel.rows?.[0];
  if (!lotteRow) return { status: "NOT_FOUND" };
  if (lotteRow.matched_unified_id) return { status: "ALREADY_SENT" };

  const 수취인명 = normalizeString(lotteRow.수하인명);
  const 연락처1 = normalizeString(lotteRow.수하인전화번호);

  const matchR = await client.query(
    `SELECT id, data FROM unified
     WHERE data->>'수취인명' = $1 AND data->>'연락처1' = $2
     FOR UPDATE`,
    [수취인명, 연락처1]
  );

  if (matchR.rows.length !== 1) {
    return { status: matchR.rows.length === 0 ? "NO_MATCH" : "AMBIGUOUS_MATCH" };
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

  const changeItems = buildUnifiedCellChangeItems({
    unifiedId,
    beforeData,
    afterData,
    columnKeys: ["택배발송일", "기기번호"],
    actionType: "lotte_shipment_send",
  });

  return { status: "SENT", unifiedId, changeItems };
}

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
      const outcome = await matchAndSendOne(client, invoiceNo);
      if (outcome.status === "SENT") {
        sentInvoiceNos.push(invoiceNo);
        changeItems.push(...outcome.changeItems);
      } else {
        skippedInvoiceNos.push(invoiceNo);
        skippedReasons[invoiceNo] = outcome.status;
      }
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

export type EcountSendResult = {
  sentCount: number;
  sentInvoiceNos: string[];
  skippedInvoiceNos: string[];
  skippedReasons: Record<string, "NOT_FOUND" | "ALREADY_SENT" | "NOT_SCANNED" | "PRODUCT_NOT_MATCHED">;
};

// ✅ 1건(운송장번호 1개)에 대해 이카운트 매출 등록을 실제로 시도하는 공용 로직.
//    지금은 아모에나/장루(거래처 00043) 매핑만 구현돼 있음 — 보건소/일반고객은 상품명 매칭이
//    안 돼서 그대로 PRODUCT_NOT_MATCHED로 남는다(설계대로).
async function attemptEcountSendOne(
  invoiceNo: string
): Promise<{ status: "SENT"; slipNo: string } | { status: "NOT_FOUND" | "ALREADY_SENT" | "NOT_SCANNED" | "PRODUCT_NOT_MATCHED" | "SEND_FAILED" }> {
  const r = await pool.query(
    `SELECT 운송장번호, 상품명, 스캔일시, 이카운트전표번호, 집하일자::text AS 집하일자 FROM lotte_shipment_data WHERE 운송장번호 = $1`,
    [invoiceNo]
  );
  const row = r.rows?.[0];
  if (!row) return { status: "NOT_FOUND" };
  if (row.이카운트전표번호) return { status: "ALREADY_SENT" };
  // ✅ 2026-10-29 사용자 확인: "이카운트 전송" 버튼은 스캔 여부와 무관하게 전송 시도한다
  //    (미매핑이면 당연히 여기서 막힘 — 그건 그대로 유지. 스캔 안 됐다는 이유만으로 막던 걸 없앤 것).

  const lines = matchAmoenaLines(normalizeString(row.상품명));
  if (!lines.length) return { status: "PRODUCT_NOT_MATCHED" };

  // ✅ 2026-10-29 사용자 확인: 이카운트 판매일자는 전송한 날짜가 아니라 집하일자로 들어가야 한다.
  const result = await registerEcountSale({
    cust: AMOENA_CUST,
    whCd: AMOENA_WH_CD,
    lines,
    ioDate: toEcountIoDate(row.집하일자),
  });
  if (!result.ok || !result.slipNos.length) {
    console.error(`이카운트 매출 등록 실패(${invoiceNo}):`, !result.ok ? result.reason : "슬립번호 없음");
    return { status: "SEND_FAILED" };
  }

  const slipNo = result.slipNos.join(",");
  await pool.query(`UPDATE lotte_shipment_data SET 이카운트전표번호 = $2 WHERE 운송장번호 = $1`, [invoiceNo, slipNo]);
  return { status: "SENT", slipNo };
}

// ✅ "이카운트 전송" 버튼(수동) 전용.
export async function sendLotteShipmentsToEcount(invoiceNos: string[]): Promise<EcountSendResult> {
  const safe = Array.from(new Set(invoiceNos.map(normalizeString).filter(Boolean))).slice(0, SEND_BATCH_MAX);

  const sentInvoiceNos: string[] = [];
  const skippedInvoiceNos: string[] = [];
  const skippedReasons: EcountSendResult["skippedReasons"] = {};

  if (!safe.length) return { sentCount: 0, sentInvoiceNos, skippedInvoiceNos, skippedReasons };

  for (const invoiceNo of safe) {
    const outcome = await attemptEcountSendOne(invoiceNo);
    if (outcome.status === "SENT") {
      sentInvoiceNos.push(invoiceNo);
    } else {
      skippedInvoiceNos.push(invoiceNo);
      // ✅ SEND_FAILED(네트워크/이카운트 쪽 오류)는 화면에는 PRODUCT_NOT_MATCHED와 동일하게
      //    "미매핑"으로만 보여준다 — 상세 사유는 서버 로그에서 확인.
      skippedReasons[invoiceNo] = outcome.status === "SEND_FAILED" ? "PRODUCT_NOT_MATCHED" : outcome.status;
    }
  }

  return { sentCount: sentInvoiceNos.length, sentInvoiceNos, skippedInvoiceNos, skippedReasons };
}

// ✅ 스캔 시 이카운트 자동 전송을 시도한다. 매칭 안 되거나 실패하면 그냥 미매핑 상태로 남고,
//    이 함수 자체는 예외를 던지지 않는다(스캔 흐름을 막으면 안 되므로).
async function attemptEcountAutoSend(invoiceNo: string): Promise<void> {
  try {
    await attemptEcountSendOne(invoiceNo);
  } catch (err) {
    console.error(`attemptEcountAutoSend(${invoiceNo}) 실패(무시하고 계속):`, err);
  }
}

export type ScanResult = {
  found: boolean;
  row?: {
    운송장번호: string;
    수하인명: string;
    수하인전화번호: string;
    수하인주소: string;
  };
};

// ✅ PM84 스캔 화면 전용: 송장번호 1건을 스캔했을 때 호출.
//    스캔일시를 항상 지금 시각으로 갱신(= "발송 확인"), 재스캔해도 그냥 갱신됨.
//    ⚠️ 통합관리 매칭+전송(matchAndSendOne)은 여기서 하지 않는다 — 통합관리 전송은 "기기번호가
//    등록된 뒤"에만 일어나야 하는데(사용자 요구사항), 바코드 스캔 시점엔 기기번호가 아직 없다.
//    실제 통합관리 전송은 registerRfidTagToLatestScan(기기번호 RFID 등록) 또는 수동 "통합관리
//    전송" 버튼(sendLotteShipmentsToUnified)에서만 일어난다.
export async function scanLotteShipment(
  invoiceNoRaw: string,
  actor: { username: string | null; name: string | null }
): Promise<ScanResult> {
  const invoiceNo = normalizeString(invoiceNoRaw);
  if (!invoiceNo) return { found: false };

  // ✅ 가벼운 사전 확인(트랜잭션 없음) — 없으면 그 자리에서 RPA를 1회 호출해 즉시 가져와본다.
  //    DB 커넥션을 붙잡은 채로 수십 초짜리 RPA 호출을 기다리면 커넥션 풀이 막히므로, 트랜잭션
  //    시작 전에 먼저 확인한다.
  const preCheck = await pool.query(`SELECT 1 FROM lotte_shipment_data WHERE 운송장번호 = $1`, [invoiceNo]);
  if (!preCheck.rows.length) {
    await triggerLotteFetchOnce();
    const recheck = await pool.query(`SELECT 1 FROM lotte_shipment_data WHERE 운송장번호 = $1`, [invoiceNo]);
    if (!recheck.rows.length) return { found: false };
  }

  const client = await pool.connect();
  let rowInfo: ScanResult["row"] | undefined;

  try {
    await client.query("BEGIN");

    const sel = await client.query(
      `SELECT 운송장번호, 수하인명, 수하인전화번호, 수하인주소 FROM lotte_shipment_data WHERE 운송장번호 = $1`,
      [invoiceNo]
    );
    const lotteRow = sel.rows?.[0];
    if (!lotteRow) {
      await client.query("ROLLBACK");
      return { found: false };
    }

    rowInfo = {
      운송장번호: normalizeString(lotteRow.운송장번호),
      수하인명: normalizeString(lotteRow.수하인명),
      수하인전화번호: normalizeString(lotteRow.수하인전화번호),
      수하인주소: normalizeString(lotteRow.수하인주소),
    };

    await client.query(`UPDATE lotte_shipment_data SET 스캔일시 = now() WHERE 운송장번호 = $1`, [invoiceNo]);

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  // ✅ 커밋 이후에 호출해야 한다 — attemptEcountAutoSend는 별도 pool 커넥션으로 스캔일시를
  //    조회하는데, 트랜잭션 안(커밋 전)에서 부르면 방금 쓴 스캔일시가 아직 안 보여서
  //    매번 NOT_SCANNED로 조용히 실패했었다(재시도 없음 정책이라 그걸로 끝 — 스캔으로는 절대
  //    자동전송이 안 되고 수동 "이카운트 전송" 버튼으로만 되던 버그).
  await attemptEcountAutoSend(invoiceNo);

  return { found: true, row: rowInfo };
}

export type RecentScanRow = {
  운송장번호: string;
  수하인명: string;
  기기번호: string;
  스캔일시: string;
  // ✅ ScanView가 이 값을 폴링해서 "미전송 -> 전송완료"로 바뀐 걸 감지하면 통합관리 화면에
  //    syncEmitUnifiedUpdate()로 신호를 쏴준다(기기번호 RFID 등록은 서버가 직접 호출받아서
  //    브라우저에서 바로 알 방법이 없기 때문 — ScanView의 기존 폴링을 이용해 대신 신호를 보냄).
  전송상태: "전송완료" | "미전송";
};

// ✅ PM84 스캔 화면의 "최근 로그" 표를 서버 데이터로 채운다. PM84 Chrome이 백그라운드 탭을
//    메모리 절약 목적으로 새로고침시켜버리는 경우가 있어서(화면에 있던 스캔 기록이 사라짐),
//    화면이 다시 열릴 때마다 서버에서 다시 불러와 복구할 수 있게 한다.
export async function listRecentScans(limit = 30): Promise<RecentScanRow[]> {
  const r = await pool.query(
    `SELECT 운송장번호, 수하인명, 기기번호, 스캔일시, matched_unified_id
     FROM lotte_shipment_data
     WHERE 스캔일시 IS NOT NULL
     ORDER BY 스캔일시 DESC
     LIMIT $1`,
    [limit]
  );
  return (r.rows || []).map((row: any) => ({
    운송장번호: normalizeString(row.운송장번호),
    수하인명: normalizeString(row.수하인명),
    기기번호: normalizeString(row.기기번호),
    스캔일시: row.스캔일시 ? new Date(row.스캔일시).toISOString() : "",
    전송상태: row.matched_unified_id ? "전송완료" : "미전송",
  }));
}

// ✅ PM84 스캔 화면에서, 방금 스캔한 송장의 기기번호가 등록됐는지 짧게 주기적으로 확인(polling)할 때 쓴다.
//    기기번호는 RFID 태그를 별도 기기(RF88+중계 앱)에서 읽어 비동기로 채워지므로, 이 화면이
//    직접 알 방법이 없어 짧은 간격으로 물어보는 방식을 쓴다.
export async function getDeviceNoForInvoice(invoiceNoRaw: string): Promise<string> {
  const invoiceNo = normalizeString(invoiceNoRaw);
  if (!invoiceNo) return "";
  const r = await pool.query(`SELECT 기기번호 FROM lotte_shipment_data WHERE 운송장번호 = $1`, [invoiceNo]);
  return normalizeString(r.rows?.[0]?.기기번호);
}

export type RfidSendStatus = "SENT" | "ALREADY_SENT" | "AMBIGUOUS_MATCH" | "NO_MATCH";

export type RfidRegisterResult =
  | { ok: false; reason: "NO_RECENT_SCAN" }
  | { ok: true; invoiceNo: string; sendStatus?: RfidSendStatus };

// ✅ RF88(RFID) 태그를 읽었을 때 호출 — PM84+RF88 전용 중계 앱에서 호출한다.
//    "가장 최근에 스캔한 송장"(스캔일시 DESC 1건)에 기기번호를 채워 넣는다.
//    스캐너는 1대만 운영한다는 전제(순서: 바코드 스캔 -> 곧바로 태그 스캔)로, 별도 세션/상태
//    전달 없이 "최근 스캔" 기준으로 매칭한다.
export async function registerRfidTagToLatestScan(
  tagIdRaw: string,
  actor: { username: string | null; name: string | null }
): Promise<RfidRegisterResult> {
  const 기기번호 = normalizeString(tagIdRaw);
  if (!기기번호) return { ok: false, reason: "NO_RECENT_SCAN" };

  const client = await pool.connect();
  let changeItems: ReturnType<typeof buildUnifiedCellChangeItems> = [];
  let sendStatus: RfidSendStatus | undefined;
  let invoiceNo = "";

  try {
    await client.query("BEGIN");

    const sel = await client.query(
      `SELECT 운송장번호 FROM lotte_shipment_data
       WHERE 스캔일시 IS NOT NULL
       ORDER BY 스캔일시 DESC
       LIMIT 1
       FOR UPDATE`
    );
    const row = sel.rows?.[0];
    if (!row) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "NO_RECENT_SCAN" };
    }
    invoiceNo = normalizeString(row.운송장번호);

    await client.query(`UPDATE lotte_shipment_data SET 기기번호 = $2 WHERE 운송장번호 = $1`, [invoiceNo, 기기번호]);

    // 이미 통합관리로 전송된 건이면, 그 unified row의 기기번호도 바로 갱신한다.
    const matchedSel = await client.query(
      `SELECT matched_unified_id FROM lotte_shipment_data WHERE 운송장번호 = $1`,
      [invoiceNo]
    );
    const matchedUnifiedId = matchedSel.rows?.[0]?.matched_unified_id;

    if (matchedUnifiedId) {
      const unifiedSel = await client.query(`SELECT data FROM unified WHERE id = $1 FOR UPDATE`, [matchedUnifiedId]);
      const beforeData = unifiedSel.rows?.[0]?.data && typeof unifiedSel.rows[0].data === "object" ? unifiedSel.rows[0].data : {};
      const afterData = { ...beforeData, 기기번호 };
      await client.query(`UPDATE unified SET data = $2::jsonb WHERE id = $1`, [matchedUnifiedId, JSON.stringify(afterData)]);

      changeItems = buildUnifiedCellChangeItems({
        unifiedId: Number(matchedUnifiedId),
        beforeData,
        afterData,
        columnKeys: ["기기번호"],
        actionType: "lotte_shipment_send",
      });
      sendStatus = "SENT";
    } else {
      // 아직 통합관리에 없는 건 -> 지금 바로 매칭 시도(가능하면 기기번호까지 같이 반영됨)
      const outcome = await matchAndSendOne(client, invoiceNo);
      if (outcome.status === "SENT") {
        changeItems = outcome.changeItems;
        sendStatus = "SENT";
      } else if (outcome.status === "AMBIGUOUS_MATCH" || outcome.status === "NO_MATCH" || outcome.status === "ALREADY_SENT") {
        sendStatus = outcome.status;
      }
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
        description: `롯데택배 RFID 태그 등록 -> 통합관리 기기번호 반영 (${invoiceNo})`,
        items: changeItems,
      });
    } catch (err) {
      console.warn("lotte_shipment_send(rfid) change history record failed (ignored):", err);
    }
  }

  return { ok: true, invoiceNo, sendStatus };
}
