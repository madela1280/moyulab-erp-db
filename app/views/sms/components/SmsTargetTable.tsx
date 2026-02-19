// app/views/sms/components/SmsTargetTable.tsx
"use client";

import type { SmsTargetRow } from "@/sms/types/sms.types";

function norm(v: any) {
  const s = String(v ?? "").trim();
  return s;
}

export default function SmsTargetTable(props: {
  loading: boolean;
  rows: SmsTargetRow[];
  selectedIds: Set<number>;
  onSelectedIdsChange: (next: Set<number>) => void;
}) {
  const { loading, rows, selectedIds, onSelectedIdsChange } = props;

  const allIds = rows.map((r) => r.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));

  function toggleAll() {
    if (allSelected) {
      onSelectedIdsChange(new Set());
      return;
    }
    onSelectedIdsChange(new Set(allIds));
  }

  function toggleOne(id: number) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedIdsChange(next);
  }

  return (
    <div className="w-full h-full flex flex-col">
      <div className="px-3 py-2 border-b flex items-center justify-between">
        <div className="text-xs text-gray-600">
          {loading ? "로딩 중..." : `총 ${rows.length}건`}
        </div>
        <button
          className="px-2 py-1 text-xs rounded border bg-white hover:bg-gray-50"
          onClick={toggleAll}
          disabled={loading || rows.length === 0}
          title="전체 선택/해제"
        >
          {allSelected ? "전체해제" : "전체선택"}
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full table-fixed border-collapse text-xs">
          <colgroup>
            <col style={{ width: 38 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 90 }} />
          </colgroup>

          <thead className="sticky top-0 bg-gray-50 z-10">
            <tr>
              <th className="border px-2 py-1 text-center">선택</th>
              <th className="border px-2 py-1 text-center">상태</th>
              <th className="border px-2 py-1 text-center">안내분류</th>
              <th className="border px-2 py-1 text-center">수취인명</th>
              <th className="border px-2 py-1 text-center">연락처</th>
              <th className="border px-2 py-1 text-center">종료일</th>
              <th className="border px-2 py-1 text-center">만기표시</th>
              <th className="border px-2 py-1 text-center">unified</th>
            </tr>
          </thead>

          <tbody>
            {!rows.length && !loading ? (
              <tr>
                <td className="border px-2 py-6 text-center text-gray-400" colSpan={8}>
                  집계된 데이터가 없습니다.
                </td>
              </tr>
            ) : null}

            {rows.map((r) => {
              const checked = selectedIds.has(r.id);
              return (
                <tr key={r.id} className={checked ? "bg-blue-50" : ""}>
                  <td className="border px-2 py-1 text-center">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOne(r.id)}
                    />
                  </td>
                  <td className="border px-2 py-1 text-center">
                    {norm(r.target_status) || "-"}
                  </td>
                  <td className="border px-2 py-1 text-center">
                    {norm(r.안내분류) || "-"}
                  </td>
                  <td className="border px-2 py-1 text-center">
                    {norm(r.수취인명) || "-"}
                  </td>
                  <td className="border px-2 py-1 text-center font-mono">
                    {norm(r.연락처1) || "-"}
                  </td>
                  <td className="border px-2 py-1 text-center font-mono">
                    {norm(r.종료일) || "-"}
                  </td>
                  <td className="border px-2 py-1 text-center font-mono">
                    {norm(r.만기일_표시문자) || "-"}
                  </td>
                  <td className="border px-2 py-1 text-center font-mono text-gray-500">
                    {r.unified_id}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}