"use client";

// app/views/lotteShipment/components/LotteShipmentGrid.tsx
//
// 롯데택배 조회 화면 표. 체크박스로 선택 -> 삭제/전송, 스캔일시 옆 ▽로 미스캔(발송 안 됨) 건을
// 위로 정렬. 모든 칸은 읽기 전용(값 입력은 스캔 연동에서만 채워짐).

import type { LotteShipmentRow } from "@/views/lotteShipment/service";

const COLUMNS: Array<{ key: keyof LotteShipmentRow; label: string; width: number }> = [
  { key: "운송장번호", label: "운송장번호", width: 140 },
  { key: "주문번호", label: "주문번호", width: 160 },
  { key: "수하인명", label: "수하인명", width: 90 },
  { key: "수하인전화번호", label: "전화번호", width: 130 },
  { key: "수하인주소", label: "주소", width: 260 },
  { key: "기기번호", label: "기기번호", width: 110 },
  { key: "스캔일시", label: "스캔일시", width: 150 },
  { key: "전송상태", label: "전송상태", width: 90 },
];

function formatScannedAt(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function LotteShipmentGrid({
  rows,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  scanSortActive,
  onToggleScanSort,
}: {
  rows: LotteShipmentRow[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: (checked: boolean) => void;
  scanSortActive: boolean;
  onToggleScanSort: () => void;
}) {
  const allChecked = rows.length > 0 && rows.every((row) => selectedIds.has(row.운송장번호));

  return (
    <div className="flex-1 min-h-0 rounded border border-slate-300 bg-white overflow-auto">
      <table className="border-collapse text-xs text-slate-900 font-normal w-full">
        <thead className="sticky top-0 z-10">
          <tr>
            <th
              className="select-none border border-slate-400 px-2 py-2 text-center font-semibold text-white"
              style={{ width: 40, minWidth: 40, backgroundColor: "#7030a0" }}
            >
              <input type="checkbox" checked={allChecked} onChange={(e) => onToggleSelectAll(e.target.checked)} title="전체 선택" />
            </th>

            {COLUMNS.map((col) => (
              <th
                key={col.key}
                className="select-none border border-slate-400 px-2 py-2 text-center font-semibold text-white whitespace-nowrap"
                style={{ width: col.width, minWidth: col.width, backgroundColor: "#7030a0" }}
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  {col.key === "스캔일시" && (
                    <button
                      type="button"
                      title={scanSortActive ? "수집순으로 되돌리기" : "미스캔(미발송) 건 위로 정렬"}
                      className={`text-[10px] leading-none ${scanSortActive ? "text-yellow-300" : "text-white/70 hover:text-white"}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onToggleScanSort();
                      }}
                    >
                      ▽
                    </button>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => (
            <tr key={row.운송장번호} className="odd:bg-white even:bg-slate-50">
              <td className="border border-slate-300 px-2 py-1 text-center">
                <input
                  type="checkbox"
                  checked={selectedIds.has(row.운송장번호)}
                  onChange={() => onToggleSelect(row.운송장번호)}
                />
              </td>
              {COLUMNS.map((col) => (
                <td key={col.key} className="border border-slate-300 px-2 py-1 whitespace-nowrap overflow-hidden text-ellipsis">
                  {col.key === "스캔일시"
                    ? formatScannedAt(row.스캔일시)
                    : col.key === "전송상태"
                    ? (
                      <span className={row.전송상태 === "전송완료" ? "text-emerald-700 font-semibold" : "text-slate-400"}>
                        {row.전송상태}
                      </span>
                    )
                    : String(row[col.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}

          {rows.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length + 1} className="px-2 py-8 text-center text-slate-400">
                데이터가 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
