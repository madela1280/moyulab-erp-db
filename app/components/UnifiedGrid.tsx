'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

/* -----------------------------
   타입 및 기본 상수
----------------------------- */
type Row = Record<string, string>;

const FALLBACK_COLUMNS: string[] = [
  '거래처분류','상태','안내분류','구매/렌탈','기기번호','기종','에러횟수','제품',
  '수취인명','연락처1','연락처2','계약자주소','택배발송일','시작일','종료일',
  '반납요청일','반납완료일','특이사항1','특이사항2','총연장횟수','신청일',
  '0차연장','1차연장','2차연장','3차연장','4차연장','5차연장',
];

const COLW_GLOBAL_KEY = 'col_widths:GLOBAL';
const CELLSTYLE_PREFIX = 'cell_styles:';
const LS_COLUMNS = 'unified_columns';

const DEFAULT_W = 120;
const BASE_WIDTHS: Record<string, number> = { 계약자주소: 360 };
const BLANK_ROWS = 20;
const CHECKBOX_W = 28;

const LABELS: Record<string, string> = {
  계약자주소: '주소',
  특이사항1: '특이사항',
};
const label = (k: string) => LABELS[k] ?? k;

/* 날짜 판별 */
const DATE_COLS = new Set(['택배발송일','시작일','종료일','반납요청일','반납완료일','신청일']);
const isYMD = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/* API 통신 */
async function fetchRowsFromDB(): Promise<Row[]> {
  const res = await fetch('/api/unified', { cache: 'no-store' });
  if (!res.ok) throw new Error('DB 불러오기 실패');
  return await res.json();
}

async function saveRowsToDB(rows: Row[]) {
  await fetch('/api/unified', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows }),
  });
}

/* localStorage util */
const loadColumns = () => {
  try {
    const raw = localStorage.getItem(LS_COLUMNS);
    const arr = raw ? JSON.parse(raw) : null;
    return Array.isArray(arr) && arr.length ? arr : FALLBACK_COLUMNS;
  } catch {
    return FALLBACK_COLUMNS;
  }
};

const mergeWidths = (cols: string[], saved: Record<string, number> | null) => {
  const base = saved || {};
  const merged: Record<string, number> = {};
  cols.forEach(c => {
    merged[c] = base[c] ?? BASE_WIDTHS[c] ?? DEFAULT_W;
  });
  return merged;
};

/* -----------------------------
   메인 컴포넌트
----------------------------- */
export default function UnifiedGrid({
  viewId,
}: {
  viewId: '통합관리' | '온라인' | '보건소' | '조리원';
}) {
  const isUnified = viewId === '통합관리';

  /* -----------------------------
     상태: 컬럼 구조
  ----------------------------- */
  const [columns, setColumns] = useState<string[]>([]);
  const colsRender = columns.length ? columns : FALLBACK_COLUMNS;

  useEffect(() => {
    setColumns(loadColumns());
  }, [viewId]);

  /* -----------------------------
     상태: 컬럼 폭 관리
  ----------------------------- */
  const [globalColW, setGlobalColW] = useState<Record<string, number>>({});
  const [displayColW, setDisplayColW] = useState<Record<string, number>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLW_GLOBAL_KEY);
      const saved = raw ? JSON.parse(raw) : {};
      const merged = mergeWidths(colsRender, saved);
      setGlobalColW(merged);
      setDisplayColW(merged);
    } catch {
      const merged = mergeWidths(colsRender, null);
      setGlobalColW(merged);
      setDisplayColW(merged);
    }
  }, [viewId, colsRender.join('|')]);

  const saveGlobalWidths = (map: Record<string, number>) => {
    localStorage.setItem(COLW_GLOBAL_KEY, JSON.stringify(map));
    setGlobalColW(map);
  };

  /* -----------------------------
     상태: DB rows
  ----------------------------- */
  const [rows, setRows] = useState<Row[]>([]);
  const loadRows = async () => {
    try {
      const db = await fetchRowsFromDB();
      if (db.length) {
        setRows(db);
      } else {
        setRows(
          Array.from({ length: BLANK_ROWS }, () =>
            Object.fromEntries(colsRender.map(c => [c, '']))
          )
        );
      }
    } catch {
      setRows(
        Array.from({ length: BLANK_ROWS }, () =>
          Object.fromEntries(colsRender.map(c => [c, '']))
        )
      );
    }
  };

  const saveRows = async (next: Row[]) => {
    setRows(next);
    await saveRowsToDB(next);
  };

  /* 초기 로드 */
  useEffect(() => {
    loadRows();
  }, [viewId, colsRender.join('|')]);

  /* -----------------------------
     행 체크/삭제
  ----------------------------- */
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  const deleteSelected = async () => {
    const next = rows.filter((_, i) => !checked[i]);
    const safe =
      next.length > 0
        ? next
        : Array.from({ length: BLANK_ROWS }, () =>
            Object.fromEntries(colsRender.map(c => [c, '']))
          );

    await saveRows(safe);
    setChecked({});
  };

  /* -----------------------------
     붙여넣기 & 자동행 확장
  ----------------------------- */
  const ensureRows = (need: number) => {
    if (rows.length >= need) return;
    const extra = Array.from({ length: need - rows.length }, () =>
      Object.fromEntries(colsRender.map(c => [c, '']))
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
      const baseIdx = colsRender.indexOf(col);

      lines.forEach((ln, rdx) => {
        const cells = ln.split('\t');
        cells.forEach((v, cdx) => {
          const ci = baseIdx + cdx;
          if (ci < colsRender.length && ri + rdx < next.length) {
            next[ri + rdx][colsRender[ci]] = v;
          }
        });
      });

      /* 0차 자동/총연장횟수 보정 */
      const ymd = /^\d{4}-\d{2}-\d{2}$/;

      const countExt = (r: Row) =>
        ['1차연장','2차연장','3차연장','4차연장','5차연장']
          .reduce((n, c) => n + ((r[c] ?? '').trim() ? 1 : 0), 0);

      for (let r = ri; r < Math.min(ri + lines.length, next.length); r++) {
        const zero = (next[r]['0차연장'] ?? '').trim();
        if (!zero) {
          const s = (next[r]['시작일'] ?? '').trim();
          const e2 = (next[r]['종료일'] ?? '').trim();
          if (ymd.test(s) && ymd.test(e2)) {
            const diff = Math.floor(
              (new Date(e2).getTime() - new Date(s).getTime()) / 86400000
            );
            if (Number.isFinite(diff)) {
              next[r]['0차연장'] = `${diff}일`;
            }
          }
        }
        next[r]['총연장횟수'] = `${countExt(next[r])}회`;
      }

      return next;
    });
  };

  /* -----------------------------
     컬럼 이동 / 추가 / 삭제
  ----------------------------- */
  const [reorderMode, setReorderMode] = useState(false);

  const handleHeaderClickForWidth = (colName: string) => {
    if (!reorderMode) return;

    const cur = globalColW[colName] ?? DEFAULT_W;
    const v = prompt(`${label(colName)} 열 너비(px)를 입력하세요`, `${cur}`);
    if (v == null) return;

    const num = Number(v);
    if (!Number.isFinite(num)) return alert('숫자를 입력하세요');

    const px = Math.max(24, Math.round(num));
    const next = { ...globalColW, [colName]: px };

    saveGlobalWidths(next);
    setDisplayColW(next);
  };

  /* width 갱신 */
  useEffect(() => {
    if (!reorderMode) {
      const raw = localStorage.getItem(COLW_GLOBAL_KEY);
      const saved = raw ? JSON.parse(raw) : {};
      setDisplayColW(mergeWidths(colsRender, saved));
    }
  }, [reorderMode, colsRender]);

  const moveCol = (idx: number, dir: -1 | 1) => {
    const cols = columns.slice();
    const ni = idx + dir;
    if (ni < 0 || ni >= cols.length) return;

    const [it] = cols.splice(idx, 1);
    cols.splice(ni, 0, it);

    localStorage.setItem(LS_COLUMNS, JSON.stringify(cols));
    setColumns(cols);
  };

  const deleteCol = async (idx: number) => {
    const colName = columns[idx];
    if (!colName) return;
    if (!confirm(`${colName} 열을 삭제할까요?`)) return;

    const newCols = columns.filter((_, i) => i !== idx);
    localStorage.setItem(LS_COLUMNS, JSON.stringify(newCols));
    setColumns(newCols);

    const nextRows = rows.map(r => {
      const nr = { ...r };
      delete nr[colName];
      return nr;
    });

    await saveRows(nextRows);

    try {
      const raw = localStorage.getItem(COLW_GLOBAL_KEY);
      const prev = raw ? JSON.parse(raw) : {};
      delete prev[colName];
      localStorage.setItem(COLW_GLOBAL_KEY, JSON.stringify(prev));
      setGlobalColW(mergeWidths(newCols, prev));
      if (!reorderMode) setDisplayColW(mergeWidths(newCols, prev));
    } catch {}
  };

  const [showAdd, setShowAdd] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [insertTarget, setInsertTarget] = useState('(끝)');
  const [insertAfter, setInsertAfter] = useState(true);

  const doAddColumn = () => {
    const name = newColName.trim();
    if (!name) return alert('새 항목명을 입력하세요');
    if (colsRender.includes(name)) return alert('이미 존재하는 항목입니다');

    const cols = colsRender.slice();
    if (insertTarget === '(끝)') {
      cols.push(name);
    } else {
      const idx = cols.indexOf(insertTarget);
      const pos = insertAfter ? idx + 1 : idx;
      cols.splice(pos, 0, name);
    }

    localStorage.setItem(LS_COLUMNS, JSON.stringify(cols));
    setColumns(cols);

    const raw = localStorage.getItem(COLW_GLOBAL_KEY);
    const saved = raw ? JSON.parse(raw) : {};
    saved[name] = BASE_WIDTHS[name] ?? DEFAULT_W;
    localStorage.setItem(COLW_GLOBAL_KEY, JSON.stringify(saved));

    setGlobalColW(mergeWidths(cols, saved));
    setDisplayColW(mergeWidths(cols, saved));

    setShowAdd(false);
    setNewColName('');
  };

  /* -----------------------------
     필터 / 정렬
  ----------------------------- */
  const [filterMode, setFilterMode] = useState(false);
  const [filters, setFilters] = useState<Record<string, Set<string>>>({});
  const [sortMap, setSortMap] = useState<Record<string, 'asc' | 'desc' | null>>({});
  const [openFilterCol, setOpenFilterCol] = useState<string | null>(null);

  const uniqueValues = (col: string) => {
    const vals = new Set<string>();

    if (DATE_COLS.has(col)) {
      rows.forEach(r => {
        const v = (r[col] ?? '').toString();
        if (isYMD(v)) {
          vals.add(v.slice(0, 4));
          vals.add(v.slice(0, 7));
        } else if (v) {
          vals.add(v);
        }
      });
    } else {
      rows.forEach(r => vals.add((r[col] ?? '').toString()));
    }

    return Array.from(vals).sort();
  };

  const filteredRows = useMemo(() => {
    const activeCols = Object.keys(filters).filter(
      c => (filters[c]?.size ?? 0) > 0
    );

    let base = rows.filter(r =>
      activeCols.every(c => {
        const val = (r[c] ?? '').toString();
        const set = filters[c]!;

        if (DATE_COLS.has(c) && isYMD(val)) {
          for (const tok of set) {
            if (val.startsWith(tok)) return true;
          }
          return false;
        }
        return set.has(val);
      })
    );

    const lastSortedCol = Object.keys(sortMap).find(c => !!sortMap[c]);
    if (lastSortedCol) {
      const dir = sortMap[lastSortedCol];
      base = base.slice().sort((a, b) => {
        const av = (a[lastSortedCol] ?? '').toString();
        const bv = (b[lastSortedCol] ?? '').toString();
        return dir === 'asc'
          ? av.localeCompare(bv)
          : bv.localeCompare(av);
      });
    }

    return base;
  }, [rows, filters, sortMap]);

  /* -----------------------------
     드래그 셀 선택
  ----------------------------- */
  const tableHostRef = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<{
    r1: number;
    c1: number;
    r2: number;
    c2: number;
  } | null>(null);
  const [draggingSel, setDraggingSel] = useState(false);

  const isSelected = (r: number, c: number) => {
    if (!sel) return false;
    const [r1, r2] = [Math.min(sel.r1, sel.r2), Math.max(sel.r1, sel.r2)];
    const [c1, c2] = [Math.min(sel.c1, sel.c2), Math.max(sel.c1, sel.c2)];
    return r >= r1 && r <= r2 && c >= c1 && c <= c2;
  };

  const startSel = (r: number, c: number) => {
    setSel({ r1: r, c1: c, r2: r, c2: c });
    setDraggingSel(true);
  };
  const extendSel = (r: number, c: number) => {
    if (draggingSel)
      setSel(s => (s ? { ...s, r2: r, c2: c } : s));
  };

  useEffect(() => {
    const up = () => setDraggingSel(false);
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);

  /* 선택된 셀 삭제 */
  const clearSelectedCells = async () => {
    if (!sel) return;

    const [r1, r2] = [Math.min(sel.r1, sel.r2), Math.max(sel.r1, sel.r2)];
    const [c1, c2] = [Math.min(sel.c1, sel.c2), Math.max(sel.c1, sel.c2)];

    const next = rows.map(r => ({ ...r }));

    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const key = colsRender[c];
        if (next[r] && key) next[r][key] = '';
      }
    }

    await saveRows(next);
  };

  /* Ctrl+C / Ctrl+X / Delete */
  useEffect(() => {
    const host = tableHostRef.current;
    if (!host) return;

    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
        e.preventDefault();
        clearSelectedCells();
      }
      if (e.key === 'Delete') {
        e.preventDefault();
        clearSelectedCells();
      }
    };

    host.addEventListener('keydown', onKey);
    return () => host.removeEventListener('keydown', onKey);
  }, [sel, rows]);

  /* -----------------------------
     셀 스타일 (localStorage)
  ----------------------------- */
  type Style = { bg?: string; color?: string };

  const [cellStyles, setCellStyles] = useState<Record<string, Style>>(() => {
    try {
      return JSON.parse(
        localStorage.getItem(CELLSTYLE_PREFIX + viewId) || '{}'
      );
    } catch {
      return {};
    }
  });

  const keyOf = (r: number, c: number) => `${r}:${c}`;

  const applyColor = (mode: 'bg' | 'text', color?: string) => {
    setCellStyles(prev => {
      const next = { ...prev };
      if (sel) {
        const [r1, r2] = [
          Math.min(sel.r1, sel.r2),
          Math.max(sel.r1, sel.r2),
        ];
        const [c1, c2] = [
          Math.min(sel.c1, sel.c2),
          Math.max(sel.c1, sel.c2),
        ];

        for (let r = r1; r <= r2; r++) {
          for (let c = c1; c <= c2; c++) {
            const k = keyOf(r, c);
            const cur = { ...(next[k] || {}) };

            if (mode === 'bg') {
              if (color) cur.bg = color;
              else delete cur.bg;
            } else {
              if (color) cur.color = color;
              else delete cur.color;
            }

            if (!cur.bg && !cur.color) delete next[k];
            else next[k] = cur;
          }
        }
      }
      return next;
    });
  };

  useEffect(() => {
    localStorage.setItem(
      CELLSTYLE_PREFIX + viewId,
      JSON.stringify(cellStyles)
    );
  }, [cellStyles, viewId]);

  /* -----------------------------
     렌더용 rows (필터 + 최소행 보충)
  ----------------------------- */
  const data = useMemo(() => {
    const minTarget = Math.max(rows.length, BLANK_ROWS);
    if (filteredRows.length >= minTarget) return filteredRows;

    const extra = Array.from(
      { length: minTarget - filteredRows.length },
      () => Object.fromEntries(colsRender.map(c => [c, '']))
    );

    return filteredRows.concat(extra);
  }, [filteredRows, rows.length, colsRender]);

  /* -----------------------------
     연장 관리(1~5차)
  ----------------------------- */
  const [showExt, setShowExt] = useState(false);
  const [extRow, setExtRow] = useState<number | null>(null);
  const [extCol, setExtCol] = useState<string | null>(null);

  const countExt = (r: Row) =>
    ['1차연장','2차연장','3차연장','4차연장','5차연장']
      .reduce((n, c) => n + ((r[c] ?? '').trim() ? 1 : 0), 0);

  const isExtCol = (c: string) =>
    /^[1-5]차연장$/.test(c);

  const openExt = (rIdx: number, col: string) => {
    if (!isExtCol(col)) return;

    const baseIdx = rIdx;
    setExtRow(baseIdx);
    setExtCol(col);
    setShowExt(true);
  };

  const handleSaveExt = async (extData: {
    days: number;
    reasons: string[];
    amount: number;
    due: string;
  }) => {
    if (extRow == null || !extCol) return;

    const next = rows.map(r => ({ ...r }));

    const summary = [
      String(extData.days),
      extData.reasons[0] ?? '',
      String(extData.amount),
      extData.due,
    ].join('/');

    next[extRow][extCol] = summary;
    next[extRow]['총연장횟수'] = `${countExt(next[extRow])}회`;

    if (extData.due.trim()) next[extRow]['종료일'] = extData.due;

    await saveRows(next);

    setShowExt(false);
    setExtRow(null);
    setExtCol(null);
  };

  /* -----------------------------
     렌더링 시작
  ----------------------------- */
  return (
    <div className="bg-white border rounded shadow-sm">
      {/* 헤더 */}
      <div className="px-4 py-3 border-b font-semibold flex items-center gap-3">
        <span className="text-lg">{viewId}</span>

        {isUnified && (
          <>
            <button
              className="px-2 py-1 text-xs border rounded hover:bg-gray-50"
              onClick={() => setShowAdd(true)}
            >
              양식추가(열)
            </button>

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
                    Object.fromEntries(colsRender.map(c => [c, '']))
                  )
                );
                saveRows(next);
              }}
            >
              행 10추가
            </button>
          </>
        )}

        <div className="ml-auto flex gap-2">
          <button
            className={`px-2 py-1 text-xs border rounded ${
              reorderMode ? 'bg-blue-50 border-blue-300' : ''
            }`}
            onClick={() => setReorderMode(v => !v)}
          >
            열 이동모드
          </button>

          <button
            className={`px-2 py-1 text-xs border rounded ${
              filterMode ? 'bg-blue-50 border-blue-300' : ''
            }`}
            onClick={() =>
              setFilterMode(v => {
                if (!v) {
                  setFilters({});
                  setSortMap({});
                  setOpenFilterCol(null);
                }
                return !v;
              })
            }
          >
            필터
          </button>
        </div>
      </div>

      {/* 테이블 */}
      <div className="p-2">
        <div
          ref={tableHostRef}
          tabIndex={0}
          className="w-full max-h-[calc(100vh-155px)] overflow-auto border rounded outline-none"
        >
          <table className="min-w-[3200px] text-sm border-collapse table-fixed">
            <colgroup>
              <col style={{ width: CHECKBOX_W }} />
              {colsRender.map(c => {
                const w = Math.round(displayColW[c] ?? DEFAULT_W);
                return <col key={c} style={{ width: w }} />;
              })}
            </colgroup>

            <thead className="bg-gray-100 sticky top-0 z-10">
              <tr>
                <th className="border text-center w-[28px]">✔</th>

                {colsRender.map((c, idx) => (
                  <th
                    key={c}
                    className="border px-2 py-1 text-xs select-none"
                  >
                    <div className="flex gap-2 items-center">
                      <button
                        className={`whitespace-nowrap ${
                          reorderMode ? 'underline decoration-dotted' : ''
                        }`}
                        onClick={() => handleHeaderClickForWidth(c)}
                      >
                        {label(c)}
                      </button>

                      {isUnified && reorderMode && (
                        <span className="flex gap-1">
                          <button
                            className="px-1 text-xs border rounded"
                            onClick={() => moveCol(idx, -1)}
                          >
                            ◀
                          </button>
                          <button
                            className="px-1 text-xs border rounded"
                            onClick={() => moveCol(idx, 1)}
                          >
                            ▶
                          </button>
                          <button
                            className="px-1 text-xs border rounded text-red-600"
                            onClick={() => deleteCol(idx)}
                          >
                            ✕
                          </button>
                        </span>
                      )}
                    </div>

                    {/* 필터 */}
                    {filterMode && (
                      <button
                        className="text-blue-600 text-xs ml-1"
                        onClick={() =>
                          setOpenFilterCol(
                            openFilterCol === c ? null : c
                          )
                        }
                      >
                        ▼
                      </button>
                    )}

                    {/* 필터 팝업 */}
                    {filterMode && openFilterCol === c && (
                      <ExcelFilterPopover
                        title={`${label(c)} 필터`}
                        allValues={uniqueValues(c)}
                        currentSet={filters[c] ?? new Set()}
                        currentSort={sortMap[c] ?? null}
                        onApply={(selSet, sort) => {
                          setFilters(prev => ({
                            ...prev,
                            [c]: new Set(selSet),
                          }));
                          setSortMap(prev => ({ ...prev, [c]: sort }));
                          setOpenFilterCol(null);
                        }}
                        onClose={() => setOpenFilterCol(null)}
                      />
                    )}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {data.map((row, rIdx) => (
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

                  {colsRender.map((c, ci) => {
                    const val = row[c] ?? '';

                    return (
                      <td
                        key={ci}
                        className={`border px-1 py-0.5 whitespace-nowrap ${
                          isSelected(rIdx, ci) ? 'bg-blue-50' : ''
                        }`}
                        onMouseDown={() => startSel(rIdx, ci)}
                        onMouseEnter={() => extendSel(rIdx, ci)}
                      >
                        <input
                          className="w-full bg-transparent border-0 text-xs outline-none"
                          value={val}
                          onClick={() => {
                            if (isExtCol(c)) openExt(rIdx, c);
                          }}
                          onChange={e => {
                            const v = e.target.value;
                            setRows(prev => {
                              const next = prev.map(r => ({ ...r }));
                              next[rIdx][c] = v;

                              /* 1~5차 → 총연장횟수 */
                              if (isExtCol(c)) {
                                next[rIdx]['총연장횟수'] =
                                  `${countExt(next[rIdx])}회`;
                              }

                              /* 0차 자동계산 */
                              if (
                                c === '시작일' ||
                                c === '종료일'
                              ) {
                                const s = next[rIdx]['시작일']?.trim() ?? '';
                                const e2 = next[rIdx]['종료일']?.trim() ?? '';
                                if (isYMD(s) && isYMD(e2)) {
                                  const diff = Math.floor(
                                    (new Date(e2).getTime() -
                                      new Date(s).getTime()) /
                                      86400000
                                  );
                                  if (Number.isFinite(diff))
                                    next[rIdx]['0차연장'] = `${diff}일`;
                                }
                              }

                              return next;
                            });
                          }}
                          onBlur={() => saveRows(rows)}
                          onPaste={e => onPaste(rIdx, c, e)}
                          style={{
                            background:
                              cellStyles[keyOf(rIdx, ci)]?.bg,
                            color:
                              cellStyles[keyOf(rIdx, ci)]?.color,
                          }}
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

      {/* 열 추가 모달 */}
      {isUnified && showAdd && (
        <AddColumnModal
          colsRender={colsRender}
          newColName={newColName}
          setNewColName={setNewColName}
          insertTarget={insertTarget}
          setInsertTarget={setInsertTarget}
          insertAfter={insertAfter}
          setInsertAfter={setInsertAfter}
          onClose={() => setShowAdd(false)}
          onApply={doAddColumn}
        />
      )}

      {/* 연장 모달 */}
      {showExt && extRow != null && extCol && (
        <ExtensionModal
          open={true}
          initial={(() => {
            const raw = rows[extRow][extCol] ?? '';
            const [d, r, a, end] = raw.split('/');
            return {
              days: Number(d) || 0,
              reasons: [r ?? ''],
              amount: Number(a) || 0,
              due: end ?? '',
            };
          })()}
          onSave={handleSaveExt}
          onClose={() => {
            setShowExt(false);
            setExtRow(null);
            setExtCol(null);
          }}
        />
      )}
    </div>
  );
}

/* ========================================================
   ExcelFilterPopover
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
        <button
          className="px-2 py-1 text-sm border rounded"
          onClick={onClose}
        >
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

/* ========================================================
   AddColumnModal
======================================================== */
function AddColumnModal({
  colsRender,
  newColName,
  setNewColName,
  insertTarget,
  setInsertTarget,
  insertAfter,
  setInsertAfter,
  onClose,
  onApply,
}: any) {
  return (
    <div className="fixed inset-0 bg-black/30 z-40 flex items-center justify-center">
      <div className="bg-white w-[420px] rounded shadow">
        <div className="px-4 py-3 border-b font-semibold">
          열 추가
        </div>

        <div className="p-4 space-y-3 text-sm">
          <div>
            <div className="mb-1">새 항목명</div>
            <input
              className="w-full border rounded px-2 py-1"
              value={newColName}
              onChange={e => setNewColName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="mb-1">기준 열</div>
              <select
                className="w-full border rounded px-2 py-1"
                value={insertTarget}
                onChange={e => setInsertTarget(e.target.value)}
              >
                <option>(끝)</option>
                {colsRender.map((c: string) => (
                   <option key={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <div className="mb-1">위치</div>
              <select
                className="w-full border rounded px-2 py-1"
                disabled={insertTarget === '(끝)'}
                value={insertAfter ? 'after' : 'before'}
                onChange={e => setInsertAfter(e.target.value === 'after')}
              >
                <option value="before">앞</option>
                <option value="after">뒤</option>
              </select>
            </div>
          </div>
        </div>

        <div className="px-4 py-3 border-t flex justify-end gap-2">
          <button
            className="px-3 py-1 border rounded"
            onClick={onClose}
          >
            취소
          </button>
          <button
            className="px-3 py-1 bg-blue-600 text-white rounded"
            onClick={onApply}
          >
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
        <div className="px-4 py-3 border-b font-semibold">
          연장 입력
        </div>

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

