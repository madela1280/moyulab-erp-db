"use client";

import { useEffect, useMemo, useState } from "react";
import UnifiedColumnPickerModal from "@/views/dataUpload/components/UnifiedColumnPickerModal";
import { syncEmitUnifiedUpdate } from "@/global-sync/sync-engine";

type UnifiedColumnsResponse = {
  order: string[];
  custom?: Array<{ key: string; created_by?: string | null; created_at?: string | null }>;
};

type RowValues = Record<string, string>;

const LS_SELECTED_KEYS = "moyulab.signup.template.selectedKeys.v2";
const LS_COL_WIDTH_STEPS = "moyulab.signup.template.colWidthSteps.v2";
const LS_ROW_COUNT = "moyulab.signup.template.rowCount.v1";

const MIN_WIDTH_PX = 70;
const STEP_MIN = 1;
const STEP_MAX = 70;

// step(1~70) -> px(70~700)
function widthPxFromStep(step: number) {
  const s = Math.max(STEP_MIN, Math.min(STEP_MAX, Math.floor(step)));
  return Math.max(MIN_WIDTH_PX, s * 10);
}

function normalizeClipboardText(s: string) {
  return String(s ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
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

export default function SignupView() {
  const [allColumns, setAllColumns] = useState<string[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [rows, setRows] = useState<RowValues[]>([{}]);

  // key -> step(1~70)
  const [colWidthSteps, setColWidthSteps] = useState<Record<string, number>>({});

  const [resizeMode, setResizeMode] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [loadingColumns, setLoadingColumns] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>("");

  async function loadColumns() {
    setLoadingColumns(true);
    setError("");
    try {
      const r = await fetch("/api/unified-columns", { cache: "no-store" });
      if (!r.ok) throw new Error(`FAILED(${r.status})`);
      const j = (await r.json()) as UnifiedColumnsResponse;
      const order = Array.isArray(j?.order) ? j.order.map(String) : [];
      setAllColumns(order);
    } catch (e: any) {
      setError(e?.message || "컬럼 목록을 불러오지 못했습니다.");
    } finally {
      setLoadingColumns(false);
    }
  }

  useEffect(() => {
    void loadColumns();

    try {
      const savedKeys = JSON.parse(localStorage.getItem(LS_SELECTED_KEYS) || "[]");
      if (Array.isArray(savedKeys)) setSelectedKeys(savedKeys.map(String));

      const savedSteps = JSON.parse(localStorage.getItem(LS_COL_WIDTH_STEPS) || "{}");
      if (savedSteps && typeof savedSteps === "object") {
        const next: Record<string, number> = {};
        for (const [k, v] of Object.entries(savedSteps)) {
          const n = Number(v);
          if (!Number.isFinite(n)) continue;
          next[String(k)] = Math.max(STEP_MIN, Math.min(STEP_MAX, Math.floor(n)));
        }
        setColWidthSteps(next);
      }

      const savedRowCount = Number(localStorage.getItem(LS_ROW_COUNT) || "");
      if (Number.isFinite(savedRowCount) && savedRowCount >= 1) {
        const count = Math.min(500, Math.max(1, Math.floor(savedRowCount)));
        setRows(Array.from({ length: count }, () => ({})));
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LS_SELECTED_KEYS, JSON.stringify(selectedKeys));
    } catch {}
  }, [selectedKeys]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_COL_WIDTH_STEPS, JSON.stringify(colWidthSteps));
    } catch {}
  }, [colWidthSteps]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_ROW_COUNT, String(rows.length));
    } catch {}
  }, [rows.length]);

  const selectedColumns = useMemo(() => {
    const set = new Set(allColumns);
    return selectedKeys.filter((k) => set.has(k));
  }, [selectedKeys, allColumns]);

  function getStep(key: string) {
    const s = Number(colWidthSteps[key]);
    if (Number.isFinite(s)) return Math.max(STEP_MIN, Math.min(STEP_MAX, Math.floor(s)));
    return 16;
  }

  function setStep(key: string, next: number) {
    const s = Math.max(STEP_MIN, Math.min(STEP_MAX, Math.floor(next)));
    setColWidthSteps((prev) => ({ ...prev, [key]: s }));
  }

  function add10Rows() {
    setRows((prev) => {
      const next = prev.slice();
      for (let i = 0; i < 10; i++) next.push({});
      return next;
    });
  }

  function delete1RowFromBottom() {
    setRows((prev) => {
      if (prev.length <= 1) return [{}];
      return prev.slice(0, prev.length - 1);
    });
  }

  function setCell(rowIndex: number, key: string, value: string) {
    setRows((prev) => {
      const next = prev.slice();
      const row = { ...(next[rowIndex] || {}) };
      row[key] = value;
      next[rowIndex] = row;
      return next;
    });
  }

  function fillFromTSV(startRow: number, startCol: number, text: string) {
    const t = normalizeClipboardText(text);
    const linesRaw = t.split("\n");
    const lines = linesRaw.filter((x) => x.length > 0);
    if (lines.length === 0) return;

    const grid = lines.map((line) => line.split("\t"));
    const isMulti = grid.length > 1 || (grid[0]?.length ?? 0) > 1;
    if (!isMulti) return;

    setRows((prev) => {
      const next = prev.slice();
      const needRows = startRow + grid.length;
      while (next.length < needRows) next.push({});

      for (let r = 0; r < grid.length; r++) {
        const rowIndex = startRow + r;
        const base = { ...(next[rowIndex] || {}) };

        for (let c = 0; c < grid[r].length; c++) {
          const colIndex = startCol + c;
          if (colIndex >= selectedColumns.length) break;
          const key = selectedColumns[colIndex];
          base[key] = String(grid[r][c] ?? "");
        }

        next[rowIndex] = base;
      }

      return next;
    });
  }

  async function handleSubmit() {
    setError("");

    if (selectedColumns.length === 0) {
      setError("전송할 컬럼을 먼저 선택해 주세요.");
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
      setError("전송할 데이터가 없습니다.");
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
      setRows((prev) => prev.map(() => ({})));
    } catch (e: any) {
      setError(e?.message || "전송에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  const showToolbar = selectedColumns.length > 0;

  // 버튼 배경을 더 엷게(slate-50)
  const btnBase =
    "inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 border rounded bg-slate-50 hover:bg-slate-100";
  const btnIcon = "text-slate-700";

  return (
    <div className="w-full h-full flex flex-col p-3 gap-3 bg-white">
      {/* Header: 신규가입 + 양식(바로 옆) */}
      <div className="flex items-center gap-3">
        <div className="text-base font-semibold text-slate-800">신규가입</div>
        <button
          type="button"
          className="text-xs px-3 py-[6px] rounded bg-yellow-50 hover:bg-yellow-100 border disabled:opacity-60"
          onClick={() => setPickerOpen(true)}
          disabled={loadingColumns}
        >
          양식
        </button>
      </div>

      {error && <div className="text-xs text-red-600">{error}</div>}

      {/* Toolbar */}
      {showToolbar && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button type="button" className={btnBase} onClick={add10Rows}>
              <span className={btnIcon}>
                <IconPlus />
              </span>
              행10추가
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
            {submitting ? "전송 중..." : "전송"}
          </button>
        </div>
      )}

      {/* Grid wrapper: 좌우/상하 스크롤 + 컬럼(헤더) 고정 */}
      <div className="flex-1 min-h-0 border rounded bg-white overflow-auto">
        {selectedColumns.length === 0 ? (
          <div className="p-3 text-xs text-slate-500">“양식”에서 컬럼을 선택하면 표가 생성됩니다.</div>
        ) : (
          <div className="min-w-max">
            {/* Header (sticky) */}
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
                          ‹
                        </button>
                        <div className="w-10 text-center text-[11px] tabular-nums">{step}</div>
                        <button
                          type="button"
                          className="w-6 h-6 border rounded bg-white hover:bg-slate-50 text-xs"
                          onClick={() => setStep(k, step + 1)}
                        >
                          ›
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Body rows: 중앙 정렬 */}
            <div>
              {rows.map((row, rowIndex) => (
                <div key={rowIndex} className="flex border-b last:border-b-0">
                  {selectedColumns.map((k, colIndex) => {
                    const step = getStep(k);
                    const widthPx = widthPxFromStep(step);

                    return (
                      <div
                        key={`${rowIndex}-${k}`}
                        className="border-r last:border-r-0"
                        style={{ width: widthPx, minWidth: MIN_WIDTH_PX }}
                      >
                        <input
                          className="w-full h-7 px-2 py-0.5 text-sm outline-none bg-white text-center"
                          value={row?.[k] ?? ""}
                          onChange={(e) => setCell(rowIndex, k, e.target.value)}
                          onPaste={(e) => {
                            const text = e.clipboardData.getData("text");
                            if (!text) return;

                            const t = normalizeClipboardText(text);
                            const linesRaw = t.split("\n");
                            const lines = linesRaw.filter((x) => x.length > 0);
                            const firstLine = lines[0] ?? "";
                            const parts = firstLine.split("\t");
                            const isMulti = lines.length > 1 || parts.length > 1;

                            if (!isMulti) return;

                            e.preventDefault();
                            fillFromTSV(rowIndex, colIndex, text);
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <UnifiedColumnPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        allColumns={allColumns}
        selectedKeys={selectedKeys}
        onChangeSelectedKeys={(next) => setSelectedKeys(next)}
        onReloadColumns={loadColumns}
        loadingColumns={loadingColumns}
      />
    </div>
  );
}