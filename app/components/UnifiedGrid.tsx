'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

type Row = Record<string, string>;

const COLUMNS: string[] = [
  '거래처분류','상태','안내분류','구매/렌탈','기기번호','기종','에러횟수','제품',
  '수취인명','연락처1','연락처2','계약자주소','택배발송일','시작일','종료일',
  '반납요청일','반납완료일','특이사항1','특이사항2','총연장횟수','신청일',
  '0차연장','1차연장','2차연장','3차연장','4차연장','5차연장'
];

export default function UnifiedGrid({ viewId }: { viewId: string }) {
  const columns = COLUMNS;
  const DEFAULT_ROWS = 20;

  const [rows, setRows] = useState<Row[]>([]);

  async function loadRows() {
    try {
      const res = await fetch('/api/unified', { cache: 'no-store' });
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) setRows(data);
      else {
        setRows(
          Array.from({ length: DEFAULT_ROWS }, () =>
            Object.fromEntries(columns.map(c => [c, '']))
          )
        );
      }
    } catch {
      setRows(
        Array.from({ length: DEFAULT_ROWS }, () =>
          Object.fromEntries(columns.map(c => [c, '']))
        )
      );
    }
  }

  async function saveRows(next: Row[]) {
    setRows(next);
    await fetch('/api/unified', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: next }),
    });
  }

  useEffect(() => {
    loadRows();
  }, [viewId]);

  const [checked, setChecked] = useState<Record<number, boolean>>({});

  const deleteSelected = async () => {
    const next = rows.filter((_, i) => !checked[i]);
    const safe =
      next.length > 0
        ? next
        : Array.from({ length: DEFAULT_ROWS }, () =>
            Object.fromEntries(columns.map(c => [c, '']))
          );
    await saveRows(safe);
    setChecked({});
  };

  const ensureRows = (need: number) => {
    if (rows.length >= need) return;
    const extra = Array.from({ length: need - rows.length }, () =>
      Object.fromEntries(columns.map(c => [c, '']))
    );
    setRows(prev => prev.concat(extra));
  };

  const onPaste = (
    ri: number,
    col: string,
    e: React.ClipboardEvent<HTMLInputElement>
  ) => {
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (!text) return;

    e.preventDefault();
    const lines = text.replace(/\r\n/g, '\n').split('\n').filter(Boolean);

    ensureRows(ri + lines.length);

    setRows(prev => {
      const next = prev.map(r => ({ ...r }));
      const baseIdx = columns.indexOf(col);

      lines.forEach((ln, rdx) => {
        const cells = ln.split('\t');
        cells.forEach((v, cdx) => {
          const ci = baseIdx + cdx;
          if (ci < columns.length && ri + rdx < next.length) {
            next[ri + rdx][columns[ci]] = v;
          }
        });
      });

      return next;
    });
  };

  const isExtensionCol = (c: string) =>
    /^[1-5]차연장$/.test(c);

  const countExt = (r: Row) =>
    ['1차연장','2차연장','3차연장','4차연장','5차연장']
      .reduce((n, c) => n + ((r[c] ?? '').trim() ? 1 : 0), 0);

  const isYMD = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

  return (
    <div className="bg-white border rounded shadow-sm">
      {/* HEADER */}
      <div className="px-4 py-3 border-b font-semibold flex items-center gap-3">
        <span className="text-lg">{viewId}</span>

        <button
          className="px-2 py-1 text-xs border rounded hover:bg-gray-50"
          onClick={deleteSelected}
        >
          선택삭제
        </button>

        <button
          className="px-2 py-1 text-xs border rounded hover:bg-gray-50"
          onClick={() => {
            const next = rows.concat(
              Array.from({ length: 10 }, () =>
                Object.fromEntries(columns.map(c => [c, '']))
              )
            );
            saveRows(next);
          }}
        >
          행 10추가
        </button>
      </div>

      {/* TABLE */}
      <div className="p-2">
        <div
          className="w-full max-h-[calc(100vh-155px)] overflow-auto border rounded outline-none"
        >
          <table className="min-w-[3200px] text-sm border-collapse table-fixed">
            <colgroup>
              <col style={{ width: 28 }} />
              {columns.map(c => (
                <col key={c} style={{ width: 120 }} />
              ))}
            </colgroup>

            <thead className="bg-gray-100 sticky top-0 z-10">
              <tr>
                <th className="border text-center w-[28px]">✔</th>
                {columns.map(c => (
                  <th key={c} className="border px-2 py-1 text-xs select-none">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {rows.map((row, rIdx) => (
                <tr key={rIdx}>
                  <td className="border text-center">
                    <input
                      type="checkbox"
                      checked={!!checked[rIdx]}
                      onChange={e =>
                        setChecked(prev => ({
                          ...prev,
                          [rIdx]: e.target.checked,
                        }))
                      }
                    />
                  </td>

                  {columns.map(c => {
                    const val = row[c] ?? '';

                    return (
                      <td key={c} className="border px-1 py-0.5 whitespace-nowrap">
                        <input
                          className="w-full bg-transparent border-0 text-xs outline-none"
                          value={val}
                          onChange={e => {
                            const v = e.target.value;
                            setRows(prev => {
                              const next = prev.map(r => ({ ...r }));
                              next[rIdx][c] = v;

                              if (isExtensionCol(c)) {
                                next[rIdx]['총연장횟수'] =
                                  `${countExt(next[rIdx])}회`;
                              }

                              if (c === '시작일' || c === '종료일') {
                                const s = next[rIdx]['시작일']?.trim() ?? '';
                                const e2 = next[rIdx]['종료일']?.trim() ?? '';
                                if (isYMD(s) && isYMD(e2)) {
                                  const diff =
                                    (new Date(e2).getTime() -
                                      new Date(s).getTime()) /
                                    86400000;
                                  if (Number.isFinite(diff))
                                    next[rIdx]['0차연장'] = `${diff}일`;
                                }
                              }

                              return next;
                            });
                          }}
                          onBlur={() => saveRows(rows)}
                          onPaste={e => onPaste(rIdx, c, e)}
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
    </div>
  );
}
/* ========================================================
   AddColumnModal
======================================================== */
function AddColumnModal({
  newColName,
  setNewColName,
  onClose,
  onApply,
}: any) {
  return (
    <div className="fixed inset-0 bg-black/30 z-40 flex items-center justify-center">
      <div className="bg-white w-[420px] rounded shadow">
        <div className="px-4 py-3 border-b font-semibold">열 추가</div>

        <div className="p-4 space-y-3 text-sm">
          <div>
            <div className="mb-1">새 항목명</div>
            <input
              className="w-full border rounded px-2 py-1"
              value={newColName}
              onChange={e => setNewColName(e.target.value)}
            />
          </div>
        </div>

        <div className="px-4 py-3 border-t flex justify-end gap-2">
          <button className="px-3 py-1 border rounded" onClick={onClose}>
            취소
          </button>
          <button className="px-3 py-1 bg-blue-600 text-white rounded" onClick={onApply}>
            추가
          </button>
        </div>
      </div>
    </div>
  );
}

/* ========================================================
   ExtensionModal — 연장 입력 모달
======================================================== */
function ExtensionModal({
  open,
  initial,
  onSave,
  onClose,
}: {
  open: boolean;
  initial: { days: number; reasons: string[]; amount: number; due: string };
  onSave: (data: any) => void;
  onClose: () => void;
}) {
  const [days, setDays] = useState(initial.days);
  const [reason, setReason] = useState(initial.reasons[0] ?? '');
  const [amount, setAmount] = useState(initial.amount);
  const [due, setDue] = useState(initial.due);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/30 z-40 flex items-center justify-center">
      <div className="bg-white w-[360px] rounded shadow">
        <div className="px-4 py-3 border-b font-semibold">연장 입력</div>

        <div className="p-4 space-y-3 text-sm">
          <div>
            <div className="mb-1">연장일수</div>
            <input
              type="number"
              value={days}
              onChange={e => setDays(Number(e.target.value))}
              className="w-full border rounded px-2 py-1"
            />
          </div>

          <div>
            <div className="mb-1">사유</div>
            <input
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full border rounded px-2 py-1"
            />
          </div>

          <div>
            <div className="mb-1">금액</div>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(Number(e.target.value))}
              className="w-full border rounded px-2 py-1"
            />
          </div>

          <div>
            <div className="mb-1">종료일 변경</div>
            <input
              type="date"
              value={due}
              onChange={e => setDue(e.target.value)}
              className="w-full border rounded px-2 py-1"
            />
          </div>
        </div>

        <div className="px-4 py-3 border-t flex justify-end gap-2">
          <button className="px-3 py-1 border rounded" onClick={onClose}>
            취소
          </button>

          <button
            className="px-3 py-1 bg-blue-600 text-white rounded"
            onClick={() =>
              onSave({
                days,
                reasons: [reason],
                amount,
                due,
              })
            }
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}

/* ========================================================
   필터 팝업 — ExcelFilterPopover
======================================================== */
function ExcelFilterPopover({
  title,
  allValues,
  currentSet,
  currentSort,
  onApply,
  onClose,
}: {
  title: string;
  allValues: string[];
  currentSet: Set<string>;
  currentSort: 'asc' | 'desc' | null;
  onApply: (sel: Set<string>, sort: 'asc' | 'desc' | null) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [temp, setTemp] = useState(new Set(currentSet));
  const [sort, setSort] = useState(currentSort);

  const filtered = useMemo(
    () =>
      allValues.filter(v =>
        v.toLowerCase().includes(search.toLowerCase())
      ),
    [allValues, search]
  );

  const toggle = (v: string, checked: boolean) => {
    const next = new Set(temp);
    if (checked) next.add(v);
    else next.delete(v);
    setTemp(next);
  };

  return (
    <div className="absolute z-40 bg-white border rounded shadow px-3 py-2 mt-1 w-[240px]">
      <div className="text-sm font-semibold mb-2">{title}</div>

      <div className="flex gap-2 mb-2">
        <button
          className={`px-2 py-1 text-xs border rounded ${
            sort === 'asc' ? 'bg-blue-50' : ''
          }`}
          onClick={() => setSort('asc')}
        >
          오름차순
        </button>
        <button
          className={`px-2 py-1 text-xs border rounded ${
            sort === 'desc' ? 'bg-blue-50' : ''
          }`}
          onClick={() => setSort('desc')}
        >
          내림차순
        </button>
      </div>

      <input
        className="w-full border rounded px-2 py-1 text-sm mb-2"
        placeholder="검색"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      <div className="max-h-40 overflow-auto text-sm border rounded p-2">
        {filtered.map(v => (
          <label key={v} className="flex gap-2 items-center">
            <input
              type="checkbox"
              checked={temp.has(v)}
              onChange={e => toggle(v, e.target.checked)}
            />
            <span>{v || '(빈 값)'}</span>
          </label>
        ))}
      </div>

      <div className="flex justify-end gap-2 mt-2">
        <button className="px-2 py-1 text-sm border rounded" onClick={onClose}>
          취소
        </button>
        <button
          className="px-2 py-1 text-sm bg-blue-600 text-white rounded"
          onClick={() => onApply(temp, sort)}
        >
          확인
        </button>
      </div>
    </div>
  );
}
