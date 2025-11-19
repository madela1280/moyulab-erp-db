'use client';

import React, { useEffect, useState } from 'react';

const COLUMNS = [
  '거래처분류','상태','안내분류','구매_렌탈','기기번호','기종','에러횟수','제품',
  '수취인명','연락처1','연락처2','계약자주소','택배발송일','시작일','종료일',
  '반납요청일','반납완료일','특이사항1','특이사항2','총연장횟수','신청일',
  '0차연장','1차연장','2차연장','3차연장','4차연장','5차연장'
];

type Row = {
  id: number;
  data: Record<string, string>;
};

export default function UnifiedGrid({ viewId }: { viewId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const r = await fetch('/api/unified', { cache: 'no-store' });
    const data = await r.json();
    setRows(data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function updateCell(id: number, key: string, value: string) {
    await fetch(`/api/unified/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value })
    });
    load();
  }

  async function addRow() {
    const empty = Object.fromEntries(COLUMNS.map(c => [c, '']));

    await fetch('/api/unified', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(empty)   // 이제 JSON 통째로 저장
    });

    load();
  }

  async function deleteRow(id: number) {
    await fetch(`/api/unified/${id}`, { method: 'DELETE' });
    load();
  }

  if (loading) {
    return <div className="p-4 text-gray-500">불러오는 중...</div>;
  }

  return (
    <div className="bg-white border rounded shadow-sm">
      <div className="px-4 py-3 border-b font-semibold flex items-center gap-3">
        <span className="text-lg">{viewId}</span>

        <button
          className="px-2 py-1 text-xs border rounded"
          onClick={addRow}
        >
          행 추가
        </button>
      </div>

      <div className="p-2">
        <div className="overflow-auto border rounded">
          <table className="min-w-[2600px] text-sm border-collapse table-fixed">
            <thead className="bg-gray-100 sticky top-0">
              <tr>
                <th className="border w-[60px]">삭제</th>
                {COLUMNS.map(c => (
                  <th key={c} className="border px-2 py-1 text-xs">{c}</th>
                ))}
              </tr>
            </thead>

            <tbody>
              {rows.map(row => (
                <tr key={row.id}>
                  <td className="border text-center">
                    <button
                      className="px-2 py-1 text-xs border rounded"
                      onClick={() => deleteRow(row.id)}
                    >
                      삭제
                    </button>
                  </td>

                  {COLUMNS.map(c => (
                    <td key={c} className="border px-1 py-0.5">
                      <input
                        className="w-full bg-transparent border-0 text-xs outline-none"
                        value={row.data?.[c] ?? ''}

                        onChange={e => {
                          const v = e.target.value;
                          setRows(prev =>
                            prev.map(r =>
                              r.id === row.id
                                ? { ...r, data: { ...r.data, [c]: v } }
                                : r
                            )
                          );
                        }}

                        onBlur={e => updateCell(row.id, c, e.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>

          </table>
        </div>
      </div>
    </div>
  );
}



