"use client";

import type { SmsTargetRow } from "@/sms/types/sms.types";

function norm(v: any) {
  const s = String(v ?? "").trim();
  return s ? s : "-";
}

const COLS: Array<{ key: string; label: string; width: number }> = [
  { key: "발송상태", label: "발송상태", width: 92 },
  { key: "거래처분류", label: "거래처분류", width: 120 },
  { key: "상태", label: "상태", width: 90 },
  { key: "안내분류", label: "안내분류", width: 120 },
  { key: "기기번호", label: "기기번호", width: 110 },
  { key: "제품", label: "제품", width: 110 },
  { key: "수취인명", label: "수취인명", width: 100 },
  { key: "연락처1", label: "연락처1", width: 120 },
  { key: "연락처2", label: "연락처2", width: 120 },
  { key: "계약자주소", label: "계약자주소", width: 260 },
  { key: "택배발송일", label: "택배발송일", width: 110 },
  { key: "시작일", label: "시작일", width: 110 },
  { key: "종료일", label: "종료일", width: 110 },
  { key: "반납요청일", label: "반납요청일", width: 110 },
  { key: "반납완료일", label: "반납완료일", width: 110 },
  { key: "특이사항1", label: "특이사항1", width: 200 },
];

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
    if (allSelected) onSelectedIdsChange(new Set());
    else onSelectedIdsChange(new Set(allIds));
  }

  function toggleOne(id: number) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedIdsChange(next);
  }

  function getValue(r: SmsTargetRow, colKey: string) {
    // 1) 발송상태는 집계 테이블의 target_status
    if (colKey === "발송상태") return norm((r as any).target_status);

    // 2) 아래 키들은 sms_targets 스냅샷에 존재하는 필드(현재 구현)
    //    - "상태"는 derived_status를 "상태"로 alias 해 내려받는 구조
    if (colKey === "상태") return norm((r as any)["상태"]);
    if (colKey === "안내분류") return norm((r as any)["안내분류"]);
    if (colKey === "수취인명") return norm((r as any)["수취인명"]);
    if (colKey === "연락처1") return norm((r as any)["연락처1"]);
    if (colKey === "연락처2") return norm((r as any)["연락처2"]);
    if (colKey === "계약자주소") return norm((r as any)["계약자주소"]);
    if (colKey === "택배발송일") return norm((r as any)["택배발송일"]);
    if (colKey === "시작일") return norm((r as any)["시작일"]);
    if (colKey === "종료일") return norm((r as any)["종료일"]);
    if (colKey === "반납요청일") return norm((r as any)["반납요청일"]);
    if (colKey === "반납완료일") return norm((r as any)["반납완료일"]);

    // 3) 통합관리에서 그대로 가져와야 하는 컬럼(현재 API가 아직 안 내려주면 "-"로 보임)
    //    - 이후 /api/sms/targets에서 unified join/스냅샷 확장 시 자동으로 채워짐
    return norm((r as any)[colKey]);
  }

  return (
    <div className="w-full h-full flex flex-col">
      <div className="px-3 py-2 border-b flex items-center justify-between">
        <div className="text-xs text-gray-600">
          {loading ? "로딩 중..." : `총 ${rows.length}건`}
        </div>

        <button
          className="px-2 py-1 text-xs rounded border bg-white hover:bg-gray-50 disabled:opacity-50"
          onClick={toggleAll}
          disabled={loading || rows.length === 0}
          title="전체 선택/해제(선택발송용)"
        >
          {allSelected ? "전체해제" : "전체선택"}
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full table-fixed border-collapse text-xs">
          <colgroup>
            {COLS.map((c) => (
              <col key={c.key} style={{ width: c.width }} />
            ))}
          </colgroup>

          <thead className="sticky top-0 bg-gray-50 z-10">
            <tr>
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
                <td className="border px-2 py-10 text-center text-gray-400" colSpan={COLS.length}>
                  집계된 데이터가 없습니다.
                </td>
              </tr>
            ) : null}

            {rows.map((r) => {
              const checked = selectedIds.has(r.id);

              return (
                <tr
                  key={r.id}
                  className={checked ? "bg-blue-50" : ""}
                  onClick={() => toggleOne(r.id)}
                  style={{ cursor: "pointer" }}
                  title="클릭: 선택/해제(선택발송용)"
                >
                  {COLS.map((c) => {
                    const v = getValue(r, c.key);

                    // 발송상태는 체크박스를 같이 보여줘서 별도 '선택' 컬럼 없이 선택 가능하게 함
                    if (c.key === "발송상태") {
                      return (
                        <td key={c.key} className="border px-2 py-1 text-center">
                          <label className="inline-flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleOne(r.id)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <span className="font-mono">{v}</span>
                          </label>
                        </td>
                      );
                    }

                    const isPhone = c.key === "연락처1" || c.key === "연락처2";
                    const isDate =
                      c.key === "택배발송일" ||
                      c.key === "시작일" ||
                      c.key === "종료일" ||
                      c.key === "반납요청일" ||
                      c.key === "반납완료일";

                    return (
                      <td
                        key={c.key}
                        className={
                          "border px-2 py-1 " +
                          (c.key === "계약자주소" ? "text-left" : "text-center") +
                          (isPhone || isDate ? " font-mono" : "")
                        }
                      >
                        {v}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}