"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { syncEmitUnifiedUpdate } from "@/global-sync/sync-engine";
import ContextMenu from "@/views/dataUpload/signup-grid/ContextMenu";
import { parseTSV, toTSV } from "@/views/dataUpload/signup-grid/tsv";
import { safeReadClipboardText, safeWriteClipboardText } from "@/views/dataUpload/signup-grid/clipboard";
import CellEditor from "@/views/dataUpload/signup-grid/editors/CellEditor";

type RowValues = Record<string, string>;

const MIN_WIDTH_PX = 70;
const STEP_MIN = 1;
const STEP_MAX = 70;

function widthPxFromStep(step: number) {
  const s = Math.max(STEP_MIN, Math.min(STEP_MAX, Math.floor(step)));
  return Math.max(MIN_WIDTH_PX, s * 10);
}

function hasAnyValue(row: RowValues) {
  for (const v of Object.values(row)) {
    if (String(v ?? "").trim() !== "") return true;
  }
  return false;
}

function IconPlus({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function IconMinus({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12h14" />
    </svg>
  );
}
function IconColumns({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 6h16M8 6v14M16 6v14M4 20h16" />
    </svg>
  );
}
function IconSend({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4z" />
    </svg>
  );
}

type CellPos = { r: number; c: number };

function normalizeRange(a: CellPos, b: CellPos) {
  const r1 = Math.min(a.r, b.r);
  const r2 = Math.max(a.r, b.r);
  const c1 = Math.min(a.c, b.c);
  const c2 = Math.max(a.c, b.c);
  return { r1, r2, c1, c2 };
}

export default function SignupGrid({
  allColumns,
  selectedKeys,
  loadingColumns,
  onError,

  initialColWidthSteps,
  initialRowCount,
  onColWidthStepsChange,
  onRowCountChange,

  partnerOptions,
  onAddPartnerOption,

  initialRows,
  onRowsChange,
  onSubmitSuccess,
}: {
  allColumns: string[];
  selectedKeys: string[];
  loadingColumns: boolean;
  onError: (msg: string) => void;

  initialColWidthSteps?: Record<string, number>;
  initialRowCount?: number;

  onColWidthStepsChange?: (next: Record<string, number>) => void;
  onRowCountChange?: (count: number) => void;

  partnerOptions?: string[];
  onAddPartnerOption?: (name: string) => void | Promise<void>;

  initialRows?: RowValues[];
  onRowsChange?: (rows: RowValues[]) => void;
  onSubmitSuccess?: () => void | Promise<void>;
}) {
  const [rows, setRows] = useState<RowValues[]>([{}]);
  const [colWidthSteps, setColWidthSteps] = useState<Record<string, number>>({});
  const [resizeMode, setResizeMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [active, setActive] = useState<CellPos | null>(null);
  const [anchor, setAnchor] = useState<CellPos | null>(null);
  const [range, setRange] = useState<{ r1: number; r2: number; c1: number; c2: number } | null>(null);
  const draggingRef = useRef(false);

  const [menu, setMenu] = useState<{ open: boolean; x: number; y: number }>(() => ({ open: false, x: 0, y: 0 }));

  const lastCopiedRef = useRef<string>("");
  const suppressFocusSelectionRef = useRef(false);
  const gridFocusRef = useRef<HTMLDivElement | null>(null);

  const settingsHydratedRef = useRef(false);

  // rows hydrate/저장 덮어쓰기 방지용
  const rowsHydratedRef = useRef(false);
  const rowsTouchedRef = useRef(false);
  const rowsInitSourceRef = useRef<"none" | "draft" | "blank">("none");

  const selectedColumns = useMemo(() => {
    const set = new Set(allColumns);
    return selectedKeys.filter((k) => set.has(k));
  }, [selectedKeys, allColumns]);

  const showToolbar = selectedColumns.length > 0;

  // settings hydrate
  useEffect(() => {
    if (settingsHydratedRef.current) return;

    if (initialColWidthSteps && typeof initialColWidthSteps === "object") {
      const next: Record<string, number> = {};
      for (const [k, v] of Object.entries(initialColWidthSteps)) {
        const n = Number(v);
        if (!Number.isFinite(n)) continue;
        next[String(k)] = Math.max(STEP_MIN, Math.min(STEP_MAX, Math.floor(n)));
      }
      setColWidthSteps(next);
    }

    settingsHydratedRef.current = true;
  }, [initialColWidthSteps]);

  // rows hydrate: draft가 "나중에" 도착하는 케이스까지 고려
  useEffect(() => {
    const hasDraftRows = Array.isArray(initialRows) && initialRows.length >= 1;

    // draft rows가 있고, 아직 사용자가 편집(터치)하기 전이면 언제든 draft로 덮어써서 "복원"이 되게 함
    if (hasDraftRows && (!rowsHydratedRef.current || !rowsTouchedRef.current)) {
      setRows(initialRows!.map((r) => (r && typeof r === "object" ? r : {})));
      rowsHydratedRef.current = true;
      rowsInitSourceRef.current = "draft";
      return;
    }

    // 아직 hydrate 안 됐고 draft도 없으면 rowCount로 빈표 생성
    if (!rowsHydratedRef.current && !hasDraftRows) {
      const rawCount = Number(initialRowCount);
      if (Number.isFinite(rawCount) && rawCount >= 1) {
        const count = Math.min(500, Math.max(1, Math.floor(rawCount)));
        setRows(Array.from({ length: count }, () => ({})));
      } else {
        setRows([{}]);
      }

      rowsHydratedRef.current = true;
      rowsInitSourceRef.current = "blank";
    }
  }, [initialRows, initialRowCount]);

  // rows 변경 시 상위로 알림(자동저장 훅에서 처리)
  useEffect(() => {
    if (!rowsHydratedRef.current) return;

    // 초기 blank 생성 직후(사용자가 아직 아무것도 안 건드림)에는 저장 호출하지 않음
    if (rowsInitSourceRef.current === "blank" && !rowsTouchedRef.current) return;

    onRowsChange?.(rows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  useEffect(() => {
    const onPointerUp = () => {
      draggingRef.current = false;
    };
    window.addEventListener("pointerup", onPointerUp);
    return () => window.removeEventListener("pointerup", onPointerUp);
  }, []);

  useEffect(() => {
    const onWindowDown = () => {
      if (menu.open) setMenu((m) => ({ ...m, open: false }));
    };
    window.addEventListener("mousedown", onWindowDown);
    return () => window.removeEventListener("mousedown", onWindowDown);
  }, [menu.open]);

  function focusGrid() {
    gridFocusRef.current?.focus();
  }

  function getStep(key: string) {
    const s = Number(colWidthSteps[key]);
    if (Number.isFinite(s)) return Math.max(STEP_MIN, Math.min(STEP_MAX, Math.floor(s)));
    return 16;
  }

  function setStep(key: string, next: number) {
    const s = Math.max(STEP_MIN, Math.min(STEP_MAX, Math.floor(next)));
    setColWidthSteps((prev) => {
      const merged = { ...prev, [key]: s };
      onColWidthStepsChange?.(merged);
      return merged;
    });
  }

  function updateRows(updater: (prev: RowValues[]) => RowValues[]) {
    rowsTouchedRef.current = true;
    setRows((prev) => {
      const next = updater(prev);
      if (next.length !== prev.length) {
        onRowCountChange?.(next.length);
      }
      return next;
    });
  }

  function add10Rows() {
    updateRows((prev) => [...prev, ...Array.from({ length: 10 }, () => ({}))]);
  }

  function delete1RowFromBottom() {
    updateRows((prev) => {
      if (prev.length <= 1) return [{}];
      return prev.slice(0, prev.length - 1);
    });
  }

  function setCell(rowIndex: number, key: string, value: string) {
    rowsTouchedRef.current = true;
    setRows((prev) => {
      const next = prev.slice();
      const row = { ...(next[rowIndex] || {}) };
      row[key] = value;
      next[rowIndex] = row;
      return next;
    });
  }

  function ensureRowsCount(minCount: number) {
    updateRows((prev) => {
      if (prev.length >= minCount) return prev;
      const next = prev.slice();
      while (next.length < minCount) next.push({});
      return next;
    });
  }

  function selectSingle(r: number, c: number) {
    const p = { r, c };
    setActive(p);
    setAnchor(p);
    setRange(normalizeRange(p, p));
  }

  function selectFromAnchor(to: CellPos) {
    if (!anchor) {
      setAnchor(to);
      setActive(to);
      setRange(normalizeRange(to, to));
      return;
    }
    setActive(to);
    setRange(normalizeRange(anchor, to));
  }

  function isSelectedCell(r: number, c: number) {
    if (!range) return false;
    return r >= range.r1 && r <= range.r2 && c >= range.c1 && c <= range.c2;
  }

  function getSelectionTopLeft(): CellPos | null {
    if (range) return { r: range.r1, c: range.c1 };
    if (active) return active;
    return null;
  }

  async function copySelection() {
    if (!range || selectedColumns.length === 0) return;

    const matrix: string[][] = [];
    for (let r = range.r1; r <= range.r2; r++) {
      const row = rows[r] || {};
      const line: string[] = [];
      for (let c = range.c1; c <= range.c2; c++) {
        const key = selectedColumns[c];
        line.push(String(row?.[key] ?? ""));
      }
      matrix.push(line);
    }

    const text = toTSV(matrix);
    lastCopiedRef.current = text;
    await safeWriteClipboardText(text);
  }

  function clearSelectionValues() {
    if (!range || selectedColumns.length === 0) return;

    rowsTouchedRef.current = true;
    setRows((prev) => {
      const next = prev.slice();
      for (let r = range.r1; r <= range.r2; r++) {
        const base = { ...(next[r] || {}) };
        for (let c = range.c1; c <= range.c2; c++) {
          const key = selectedColumns[c];
          base[key] = "";
        }
        next[r] = base;
      }
      return next;
    });
  }

  function pasteMatrixAt(start: CellPos, matrix: string[][]) {
    if (selectedColumns.length === 0) return;
    if (matrix.length === 0) return;

    rowsTouchedRef.current = true;

    const needRows = start.r + matrix.length;
    ensureRowsCount(needRows);

    setRows((prev) => {
      const next = prev.slice();
      for (let rr = 0; rr < matrix.length; rr++) {
        const rIndex = start.r + rr;
        const base = { ...(next[rIndex] || {}) };

        for (let cc = 0; cc < matrix[rr].length; cc++) {
          const cIndex = start.c + cc;
          if (cIndex >= selectedColumns.length) break;
          const key = selectedColumns[cIndex];
          base[key] = String(matrix[rr][cc] ?? "");
        }

        next[rIndex] = base;
      }
      return next;
    });
  }

  async function pasteFromClipboard() {
    const start = getSelectionTopLeft();
    if (!start) return;

    const text = (await safeReadClipboardText()) || lastCopiedRef.current || "";
    if (!text) return;

    const matrix = parseTSV(text);
    pasteMatrixAt(start, matrix);
  }

  function handleKeyDownCapture(e: React.KeyboardEvent) {
    if (!showToolbar) return;

    const k = e.key.toLowerCase();

    if (k === "delete") {
      if (range) {
        e.preventDefault();
        clearSelectionValues();
      }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && k === "c") {
      e.preventDefault();
      void copySelection();
      return;
    }
  }

  function handlePasteCapture(e: React.ClipboardEvent) {
    if (!showToolbar) return;

    const start = getSelectionTopLeft();
    if (!start) return;

    const text = e.clipboardData.getData("text");
    if (!text) return;

    const matrix = parseTSV(text);
    e.preventDefault();
    pasteMatrixAt(start, matrix);
  }

  function findCellFromPoint(x: number, y: number): CellPos | null {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    if (!el) return null;
    const cell = el.closest("[data-sg-cell='1']") as HTMLElement | null;
    if (!cell) return null;
    const r = Number(cell.dataset.r);
    const c = Number(cell.dataset.c);
    if (!Number.isFinite(r) || !Number.isFinite(c)) return null;
    return { r, c };
  }

  function handleCellPointerDown(e: React.PointerEvent, r: number, c: number) {
    if (e.button !== 0) return;
    if (!showToolbar) return;

    focusGrid();

    draggingRef.current = true;
    const p = { r, c };
    setAnchor(p);
    setActive(p);
    setRange(normalizeRange(p, p));

    const t = e.target as HTMLElement | null;
    const tag = t?.tagName?.toUpperCase?.() ?? "";
    const isInteractive = tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || (t as any)?.isContentEditable;

    if (!isInteractive) e.preventDefault();

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handleCellPointerMove(e: React.PointerEvent) {
    if (!draggingRef.current) return;
    const p = findCellFromPoint(e.clientX, e.clientY);
    if (!p) return;
    selectFromAnchor(p);
  }

  function handleCellPointerUp(e: React.PointerEvent) {
    draggingRef.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  }

  function handleCellContextMenu(e: React.MouseEvent, r: number, c: number) {
    if (!showToolbar) return;

    e.preventDefault();
    focusGrid();

    suppressFocusSelectionRef.current = true;

    if (!isSelectedCell(r, c)) {
      selectSingle(r, c);
    } else {
      setActive({ r, c });
    }

    setMenu({ open: true, x: e.clientX, y: e.clientY });
  }

  function handleEditorFocus(r: number, c: number) {
    if (suppressFocusSelectionRef.current) {
      suppressFocusSelectionRef.current = false;
      if (range && isSelectedCell(r, c)) {
        setActive({ r, c });
        return;
      }
    }

    if (range && isSelectedCell(r, c)) {
      setActive({ r, c });
      return;
    }
    selectSingle(r, c);
  }

  async function handleSubmit() {
    onError("");

    if (selectedColumns.length === 0) {
      onError("저장할 컬럼을 먼저 선택해 주세요.");
      return;
    }

    const targets = rows
      .map((row) => {
        const data: Record<string, string> = {};
        for (const k of selectedColumns) data[k] = String(row?.[k] ?? "");
        return data;
      })
      .filter((data) => hasAnyValue(data));

    if (targets.length === 0) {
      onError("저장할 데이터가 없습니다.");
      return;
    }

    setSubmitting(true);
    try {
      for (const data of targets) {
        const r = await fetch("/api/unified/signup-submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data }),
        });
        if (!r.ok) {
          const t = await r.text().catch(() => "");
          throw new Error(t || `FAILED(${r.status})`);
        }
      }

      syncEmitUnifiedUpdate();

      rowsTouchedRef.current = true;
      setRows((prev) => prev.map(() => ({})));

      await onSubmitSuccess?.();
    } catch (e: any) {
      onError(e?.message ? "저장에 실패했습니다." : "저장에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  const btnBase = "inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 border rounded bg-slate-50 hover:bg-slate-100";
  const btnIcon = "text-slate-700";

  return (
    <div className="w-full flex flex-col gap-1.5 flex-1 min-h-0" onKeyDownCapture={handleKeyDownCapture} onPasteCapture={handlePasteCapture}>
      <div ref={gridFocusRef} tabIndex={0} className="absolute opacity-0 pointer-events-none" />

      {showToolbar && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button type="button" className={btnBase} onClick={add10Rows}>
              <span className={btnIcon}>
                <IconPlus />
              </span>
              행 10추가
            </button>

            <button type="button" className={btnBase} onClick={delete1RowFromBottom}>
              <span className={btnIcon}>
                <IconMinus />
              </span>
              행삭제
            </button>

            <button
              type="button"
              className={`${btnBase} ${resizeMode ? "bg-slate-800 text-white hover:bg-slate-800" : ""}`}
              onClick={() => setResizeMode((v) => !v)}
            >
              <span className={resizeMode ? "text-white" : btnIcon}>
                <IconColumns />
              </span>
              열넓이
            </button>
          </div>

          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-xs px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60"
            onClick={handleSubmit}
            disabled={submitting || loadingColumns}
          >
            <IconSend className="w-4 h-4" />
            {submitting ? "저장 중.." : "저장"}
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 border rounded bg-white overflow-auto">
        {selectedColumns.length === 0 ? (
          <div className="p-3 text-xs text-slate-500">양식에서 컬럼을 선택하면 표가 생성됩니다.</div>
        ) : (
          <div className="min-w-max">
            <div className="flex border-b bg-slate-100 sticky top-0 z-10">
              {selectedColumns.map((k) => {
                const step = getStep(k);
                const widthPx = widthPxFromStep(step);

                return (
                  <div
                    key={k}
                    className="px-2 py-1.5 text-[12px] font-semibold text-slate-700 border-r last:border-r-0 select-none text-center"
                    style={{ width: widthPx, minWidth: MIN_WIDTH_PX }}
                    title={k}
                  >
                    <div className="truncate leading-5">{k}</div>

                    {resizeMode && (
                      <div className="mt-1 flex items-center justify-center gap-1">
                        <button
                          type="button"
                          className="w-6 h-6 border rounded bg-white hover:bg-slate-50 text-xs"
                          onClick={() => setStep(k, step - 1)}
                        >
                          −
                        </button>
                        <div className="w-10 text-center text-[11px] tabular-nums">{step}</div>
                        <button
                          type="button"
                          className="w-6 h-6 border rounded bg-white hover:bg-slate-50 text-xs"
                          onClick={() => setStep(k, step + 1)}
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div>
              {rows.map((row, r) => (
                <div key={r} className="flex border-b last:border-b-0">
                  {selectedColumns.map((key, c) => {
                    const step = getStep(key);
                    const widthPx = widthPxFromStep(step);

                    const selected = range ? r >= range.r1 && r <= range.r2 && c >= range.c1 && c <= range.c2 : false;
                    const isActive = active?.r === r && active?.c === c;

                    return (
                      <div
                        key={`${r}-${key}`}
                        data-sg-cell="1"
                        data-r={r}
                        data-c={c}
                        className={[
                          "border-r last:border-r-0",
                          "relative",
                          selected ? "bg-blue-50" : "bg-white",
                          isActive ? "ring-2 ring-blue-400 ring-inset" : "",
                        ].join(" ")}
                        style={{ width: widthPx, minWidth: MIN_WIDTH_PX }}
                        onPointerDownCapture={(e) => handleCellPointerDown(e, r, c)}
                        onPointerMoveCapture={handleCellPointerMove}
                        onPointerUpCapture={handleCellPointerUp}
                        onContextMenu={(e) => handleCellContextMenu(e, r, c)}
                      >
                        <CellEditor
                          columnKey={key}
                          value={String(row?.[key] ?? "")}
                          onFocus={() => handleEditorFocus(r, c)}
                          onChange={(v) => setCell(r, key, v)}
                          partnerOptions={partnerOptions || []}
                          onAddPartnerOption={onAddPartnerOption}
                        />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        <ContextMenu
          open={menu.open}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu((m) => ({ ...m, open: false }))}
          items={[
            {
              label: "지우기",
              onClick: () => {
                clearSelectionValues();
                setMenu((m) => ({ ...m, open: false }));
              },
            },
            {
              label: "복사",
              onClick: async () => {
                await copySelection();
                setMenu((m) => ({ ...m, open: false }));
              },
            },
            {
              label: "붙여넣기",
              onClick: async () => {
                await pasteFromClipboard();
                setMenu((m) => ({ ...m, open: false }));
              },
            },
          ]}
        />
      </div>
    </div>
  );
}