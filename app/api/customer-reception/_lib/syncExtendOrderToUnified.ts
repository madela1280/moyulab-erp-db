// app/api/customer-reception/_lib/syncExtendOrderToUnified.ts
//
// SMS 완전일치로 payment_orders(order_type='extend'|'overdue')가 자동 confirmed될 때,
// 사람이 ERP "연장·연체료" 화면을 열 때까지 기다리지 않고 서버가 즉시 통합관리(1~20차연장)에
// 반영한다. 기존 화면의 "전송" 버튼(sendOneRow, ExtendOrderView.tsx)이 하던 일을 서버 SQL로
// 그대로 재현한 것 — syncPatch(브라우저 전용)는 여기서 쓸 수 없어서 직접 DB를 갱신한다.
//
// ✅ 동시성 안전장치: 통합관리에 쓰기 전에 먼저 "이 건은 내가 처리한다"고 원자적으로
//    선점(claim)한다 — UPDATE ... WHERE unified_synced_at IS NULL RETURNING이 1건 성공한
//    쪽만 실제로 쓰고, 0건이면(이미 화면 쪽이나 다른 요청이 먼저 처리함) 조용히 스킵한다.
//    PostgreSQL이 행 단위로 직렬화해주므로, 화면이 몇 대의 PC에서 동시에 열려있어도 안전하다
//    (대표님 확인, 2026-10-27).

import { query } from "@/lib/db";
import {
  findFirstEmptyExtensionKey,
  sumExtensionDaysFromRow,
} from "@/views/unified/extensions/extensionCompute";
import { computeEndDateFromStartAndTotalDays } from "@/views/unified/extensions/extensionDate";
import { formatExtensionCell } from "@/views/unified/extensions/extensionFormat";
import { getExtensionPaymentMethodLabel } from "@/views/customerReception/extend-order/columns";

function toDateOnly(d: Date | string | null): string {
  if (!d) return "";
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export type SyncExtendOrderResult =
  | { ok: true; skipped: true } // 선점 실패(이미 다른 경로가 처리 중/완료) — 정상적인 스킵
  | { ok: true; skipped: false } // 실제로 통합관리에 반영 완료
  | { ok: false; reason: string }; // 선점은 됐지만 반영 실패(예: 1~20차연장 칸이 꽉 참)

export async function syncExtendOrderToUnified(orderId: number): Promise<SyncExtendOrderResult> {
  // 1) 원자적 선점 — 이 UPDATE가 1건 반영돼야만 아래 로직을 계속 진행한다.
  //    order_type을 extend/overdue로 제한해서, 포장재구매(parts) 등 다른 종류는 절대 안 건드린다.
  const claim = await query(
    `
    UPDATE payment_orders
    SET unified_synced_at = now()
    WHERE id = $1
      AND order_type IN ('extend', 'overdue')
      AND status = 'confirmed'
      AND unified_id IS NOT NULL
      AND unified_synced_at IS NULL
    RETURNING unified_id, is_overdue_settlement, extend_days, amount, confirmed_at
    `,
    [orderId]
  );

  const claimed = claim.rows?.[0];
  if (!claimed) return { ok: true, skipped: true };

  try {
    const unifiedId = Number(claimed.unified_id);

    const unifiedSel = await query(`SELECT data FROM unified WHERE id = $1`, [unifiedId]);
    const beforeData =
      unifiedSel.rows?.[0]?.data && typeof unifiedSel.rows[0].data === "object"
        ? unifiedSel.rows[0].data
        : {};

    const emptyKey = findFirstEmptyExtensionKey(beforeData);
    if (!emptyKey) {
      console.error(
        "[syncExtendOrderToUnified] 1~20차연장 칸이 모두 차있어 반영하지 못함:",
        JSON.stringify({ orderId, unifiedId })
      );
      return { ok: false, reason: "통합관리 1~20차연장 칸이 모두 차있습니다" };
    }

    const cellText = formatExtensionCell({
      days: String(claimed.extend_days ?? ""),
      paymentMethod: getExtensionPaymentMethodLabel(!!claimed.is_overdue_settlement),
      amount: String(claimed.amount ?? ""),
      receivedDate: toDateOnly(claimed.confirmed_at),
    });

    const afterData: Record<string, any> = { ...beforeData, [emptyKey]: cellText };

    const totalDays = sumExtensionDaysFromRow(afterData);
    const nextEnd = computeEndDateFromStartAndTotalDays(String(afterData?.["시작일"] ?? ""), totalDays);
    if (nextEnd) afterData["종료일"] = nextEnd;

    await query(`UPDATE unified SET data = $2::jsonb WHERE id = $1`, [
      unifiedId,
      JSON.stringify(afterData),
    ]);

    console.log(
      "[syncExtendOrderToUnified] 자동 반영 완료:",
      JSON.stringify({ orderId, unifiedId, emptyKey, nextEnd })
    );
    return { ok: true, skipped: false };
  } catch (e: any) {
    console.error("[syncExtendOrderToUnified] 반영 중 오류(선점은 이미 됨):", orderId, e);
    return { ok: false, reason: e?.message || "server_error" };
  }
}
