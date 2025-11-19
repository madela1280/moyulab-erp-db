'use client';

import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

type Row = { id: number } & Record<string, string>;

const COLUMNS = [
  '거래처분류','상태','안내분류','구매_렌탈','기기번호','기종','에러횟수','제품',
  '수취인명','연락처1','연락처2','계약자주소','택배발송일','시작일','종료일',
  '반납요청일','반납완료일','특이사항1','특이사항2','총연장횟수','신청일',
  '0차연장','1차연장','2차연장','3차연장','4차연장','5차연장'
];

const SOCKET_URL = 'wss://moyulab-socket.onrender.com';

export default function UnifiedGrid({ viewId }: { viewId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState<Socket | null>(null);

  // 1) 최초 데이터 로딩
  async function load() {
    const r = await fetch('/api/unified', { cache: 'no-store' });
    const data = await r.json();
    setRows(data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  // 2) 소켓 연결
  useEffect(() => {
    const s = io(SOCKET_URL, { transports: ['websocket'] });

    s.on('connect', () => {
      console.log('소켓 연결:', s.id);
      s.emit('join', 'global');
    });

    // 🔥 실시간 업데이트 적용
    s.on('unified:update', (updatedRow: Row) => {
      setRows(prev => {
        // 삭제의 경우
        if (updatedRow.deleted) {
          return prev.filter(r => r.id !== updatedRow.id);
        }

        // 수정·추가의 경우
        const exists = prev.some(r => r.id === updatedRow.id);
        if (!exists) return [...prev, updatedRow];

        return prev.map(r =>
          r.id === updatedRow.id ? updatedRow : r
        );
      });
    });

    setSocket(s);
    return () => s.disconnect();
  }, []);

  // 3) 셀 업데이트
  async function updateCell(id: number, col: string, value: string) {
    await fetch(`/api/unified/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [col]: value })
    });

    // 🔥 DB 반영 후 본인 화면 업데이트
    setRows(prev =>
      prev.map(r =>
        r.id === id ? { ...r, [col]: value } : r
      )
    );

    // 🔥 다른 사용자에게 실시간 전송
    socket?.emit('unified:update', {
      ...rows.find(r => r.id === id)!,
      [col]: value
    });
  }

  // 4) 행 추가
  async function addRow() {
    const empty = Object.fromEntries(COLUMNS.map(c => [c, '']));
    const r = await fetch('/api/unified', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(empty)
    });
    const newRow = await r.json();

    setRows(prev => [...prev, newRow]);
    socket?.emit('unified:update', newRow);
  }

  // 5) 행 삭제
  async function deleteRow(id: number) {
    await fetch(`/api/unified/${id}`, { method: 'DELETE' });

    setRows(prev => prev.filter(r => r.id !== id));

    socket?.emit('unified:update', { id, deleted: true } as any);
  }


  // ------- UI -------
  if (loading) {
    return (
      <div className="p-4 text-gray-500">불러오는 중...</div>
    );
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
                        value={row[c] ?? ''}
                        onChange={e => {
                          const v = e.target.value;

                          // 본인 화면 즉시 반영
                          setRows(prev =>
                            prev.map(r =>
                              r.id === row.id ? { ...r, [c]: v } : r
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



