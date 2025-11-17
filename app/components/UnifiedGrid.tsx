'use client';

import React, { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { type Category } from '../lib/rules';
import { GuideRuleModal, CategoryRuleModal } from './RuleModals';
import FindPanel from './FindPanel';
import ExtensionModal from './ExtensionModal';

let socket: Socket | null = null;

/** 🔥 소켓 연결을 단 1번만 생성 (중복 방지) */
function initSocket() {
  if (typeof window === 'undefined') return null;
  if (socket) return socket;

  socket = io("ws://moulab.kr:4001", {
  transports: ["websocket"],
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 2000,
  withCredentials: false,
});

  socket.on("connect", () => {
  console.log("🔥 WebSocket 연결 성공:", socket?.id);
  socket?.emit("join", "global");
});

  return socket;
}

type Row = Record<string, string>;

const FALLBACK_COLUMNS: string[] = [
  '거래처분','상태','안내분류','구매/렌탈','기기번호','기종','에러횟수','제품',
  '수취인명','연락처1','연락처2','계약자주소','택배발송일','시작일','종료일',
  '반납요청일','반납완료일','특이사항1','특이사항2','총연장횟수','신청일',
  '0차연장','1차연장','2차연장','3차연장','4차연장','5차연장'
];

const LABELS: Record<string, string> = { 계약자주소: '주소', 특이사항1: '특이사항' };
const label = (k: string) => LABELS[k] ?? k;

const BLANK_ROWS = 20;

export default function UnifiedGrid({ viewId = '통합관리' }: { viewId?: '통합관리'|'온라인'|'보건소'|'조리원' }) {
  const [columns, setColumns] = useState<string[]>(FALLBACK_COLUMNS);
  const colsRender = columns;
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const savingRef = useRef(false);

  /** 🔥 소켓 초기화 (렌더 시 단 한 번만 실행) */
  useEffect(() => {
    initSocket();
  }, []);

  /** 🔹 DB 데이터 불러오기 + 소켓 실시간 반영 */
  useEffect(() => {
    const fetchRows = async () => {
      try {
        const res = await fetch(`/api/unified?view=${encodeURIComponent(viewId)}`);
        const data = await res.json();

        if (Array.isArray(data) && data.length > 0) {
          setRows(data);
        } else {
          setRows(
            Array.from({ length: BLANK_ROWS }, () =>
              Object.fromEntries(colsRender.map((c) => [c, '']))
            )
          );
        }
      } catch (err) {
        console.error('❌ 데이터 불러오기 실패:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchRows();

    if (socket) {
      const s = socket;

      const onUpdate = (data: Row[]) => {
        console.log("📡 update 수신:", data);
        setRows(data);
      };

      const onUnifiedUpdate = (data: Row[]) => {
        console.log("📡 unified:update 수신:", data);
        setRows(data);
      };

      s.on("update", onUpdate);
      s.on("unified:update", onUnifiedUpdate);

      return () => {
        s.off("update", onUpdate);
        s.off("unified:update", onUnifiedUpdate);
      };
    }
  }, [viewId, colsRender]);

  /** 🔹 자동 저장 (DB + 소켓 브로드캐스트) */
  const autoSave = async (next: Row[]) => {
    if (savingRef.current) return;
    savingRef.current = true;

    try {
      await fetch('/api/unified', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ viewId, rows: next }),
      });

      socket?.emit("unified:update", next);
      console.log("✅ DB 자동저장 + 실시간 브로드캐스트 완료");
    } catch (err) {
      console.error("❌ 자동저장 실패:", err);
    } finally {
      savingRef.current = false;
    }
  };

  /** 🔹 입력 변경 */
  const handleChange = (rIdx: number, key: string, value: string) => {
    setRows((prev) => {
      const next = [...prev];
      next[rIdx] = { ...next[rIdx], [key]: value };
      autoSave(next);
      return next;
    });
  };

  /** 🔹 행 추가 */
  const addRow = () => {
    setRows((prev) => {
      const next = [...prev, Object.fromEntries(colsRender.map((c) => [c, '']))];
      autoSave(next);
      return next;
    });
  };

  /** 🔹 행 삭제 */
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const deleteSelected = () => {
    const next = rows.filter((_, i) => !checked[i]);
    const safe = next.length
      ? next
      : Array.from({ length: BLANK_ROWS }, () =>
          Object.fromEntries(colsRender.map((c) => [c, '']))
        );
    setRows(safe);
    autoSave(safe);
    setChecked({});
  };

  if (loading) return <div className="p-6 text-gray-500">데이터 불러오는 중...</div>;

  return (
    <>

      <div style={{ position:'fixed', top:0, right:0, background:'red', color:'white', padding:'2px 6px', fontSize:'11px', zIndex:9999 }}>
        GRID-V1
      </div>

      <div className="bg-white border rounded shadow-sm p-4 subpixel-antialiased">
        <div className="flex items-center justify-between mb-3">
          <div className="flex gap-2">
            <button className="px-2 py-1 text-xs border rounded hover:bg-gray-50" onClick={addRow}>행 추가</button>
            <button className="px-2 py-1 text-xs border rounded hover:bg-gray-50" onClick={deleteSelected}>선택 삭제</button>
          </div>
          <div className="text-sm text-gray-600">총 {rows.length}행</div>
        </div>

        <div className="overflow-auto max-h-[calc(100vh-180px)]">
          <table className="min-w-[2400px] text-[12px] border-collapse">
            <thead className="bg-gray-100 sticky top-0 z-10">
              <tr>
                <th className="border w-[28px] text-center">✔</th>
                {colsRender.map(c => <th key={c} className="border px-1 py-1 text-left">{label(c)}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  <td className="border text-center">
                    <input type="checkbox" checked={!!checked[ri]} onChange={(e) => setChecked(prev => ({ ...prev, [ri]: e.target.checked }))} />
                  </td>
                  {colsRender.map((c, ci) => {
                    const v = r[c] ?? '';
                    return (
                      <td key={ci} className="border px-1 py-[2px]">
                        <input
                          value={v}
                          onChange={(e) => handleChange(ri, c, e.target.value)}
                          className="w-full bg-transparent border-0 outline-none text-[11px]"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}



