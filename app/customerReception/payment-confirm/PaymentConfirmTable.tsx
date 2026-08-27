// app/customerReception/payment-confirm/PaymentConfirmTable.tsx
"use client";

import type { PaymentOrderRow } from "@/customerReception/payment-confirm/types";

function norm(v: any) {
  const s = String(v ?? "").trim();
  return s ? s : "-";
}

function formatAmount(n: number) {
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString("ko-KR") + "원";
}

const COLS: Array<{ key: string; label: string; width: number }> = [
  { key: "received_at", label: "접수 시각", width: 140 },
  { key: "order_type", label: "구분", width: 90 },
  { key: "status", label: "상태", width: 100 },
  { key: "customer_name", label: "고객명", width: 100 },
  { key: "device_model", label: "기종/품목", width: 120 },
  { key: "partner_category", label: "대여처", width: 110 },
  { key: "extend_info", label: "연장일수 · 새만기일", width: 160 },
  { key: "amount", label: "금액", width: 100 },
  { key: "depositor_name", label: "입금자명", width: 100 },
  { key: "expires_at", label: "남은 기한", width: 140 },
];

const ORDER_TYPE_LABEL: Record<string, string> = {
  extend: "연장",
  overdue: "연체료",
  parts: "포장재구매",
};

const STATUS_LABEL: Record<string, string> = {
  waiting: "입금대기",
  matched: "확인필요", // 입금자명은 일치하지만 금액이 다르게 들어온 경우
  confirmed: "입금확정",
  expired: "만료",
  canceled: "취소",
};

export default function PaymentConfirmTable(props: {
  loading: boolean;
  rows: PaymentOrderRow[];
  selectedIds: Set<number>;
  onSelectedIdsChange: (next: Set<number>) => void;
}) {
  const { loading, rows, selectedIds, onSelectedIdsChange } = props;

  const allIds = rows.map((r) => r.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));

  function toggleAll() {
    if (allSelected) onSelectedIdsChange(new Set());
    else onSelectedIdsChange(new Set(allIds));
  }

  function toggleOne(id: number) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedIdsChange(next);
  }

  function getValue(r: PaymentOrderRow, colKey: string) {
    if (colKey === "order_type") return ORDER_TYPE_LABEL[r.order_type] ?? r.order_type;
    if (colKey === "status") return STATUS_LABEL[r.status] ?? r.status;
    if (colKey === "extend_info") {
      if (r.order_type !== "extend") return "-";
      const days = r.extend_days != null ? `${r.extend_days}일` : "-";
      const end = norm(r.new_end_date);
      return `${days} · ${end}`;
    }
    if (colKey === "amount") return formatAmount(r.amount);
    return norm((r as any)[colKey]);
  }

  // 임박 건 강조: 아직 입금대기 중이면서 만료까지 3시간 이내인 것만(확정·만료·취소 건은 대상 아님)
  function isUrgent(r: PaymentOrderRow) {
    if (r.status !== "waiting") return false;
    const t = new Date(r.expires_at).getTime();
    if (!Number.isFinite(t)) return false;
    return t - Date.now() < 3 * 60 * 60 * 1000;
  }

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full table-fixed border-collapse text-xs">
          <colgroup>
            <col style={{ width: 44 }} />
            {COLS.map((c) => (
              <col key={c.key} style={{ width: c.width }} />
            ))}
          </colgroup>

          <thead className="sticky top-0 bg-gray-50 z-10">
            <tr>
              <th className="border px-2 py-1 text-center">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  disabled={loading || rows.length === 0}
                  title="전체 선택/해제"
                />
              </th>
              {COLS.map((c) => (
                <th key={c.key} className="border px-2 py-1 text-center">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {!rows.length && !loading ? (
              <tr>
                <td className="border px-2 py-10 text-center text-gray-400" colSpan={COLS.length + 1}>
                  대기 중인 입금 건이 없습니다.
                </td>
              </tr>
            ) : null}

            {rows.map((r) => {
              const checked = selectedIds.has(r.id);
              const urgent = isUrgent(r);

              return (
                <tr
                  key={r.id}
                  className={checked ? "bg-blue-50" : urgent ? "bg-red-50" : ""}
                  onClick={() => toggleOne(r.id)}
                  style={{ cursor: "pointer" }}
                  title="클릭: 선택/해제"
                >
                  <td className="border px-2 py-1 text-center">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOne(r.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  {COLS.map((c) => (
                    <td
                      key={c.key}
                      className={
                        "border px-2 py-1 text-center" +
                        (c.key === "expires_at" && urgent ? " text-red-600 font-semibold" : "")
                      }
                    >
                      {getValue(r, c.key)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
