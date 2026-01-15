"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import UnifiedColumnPickerModal from "@/views/dataUpload/components/UnifiedColumnPickerModal";
import { syncEmitUnifiedUpdate } from "@/global-sync/sync-engine";

type UnifiedColumnsResponse = {
  order: string[];
  custom?: Array<{ key: string; created_by?: string | null; created_at?: string | null }>;
};

type RowValues = Record<string, string>;

const LS_SELECTED_KEYS = "moyulab.signup.template.selectedKeys.v1";
const LS_COL_WIDTHS = "moyulab.signup.template.colWidths.v1";

const DEFAULT_COL_WIDTH = 160;
const MIN_COL_WIDTH = 70; // 요구: 통합관리 기준으로 70까지

function normalizeClipboardText(s: string) {
  return String(s ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function hasAnyValue(row: RowValues) {
  for (const v of Object.values(row)) {
    if (String(v ?? "").trim() !== "") return true;
  }
  return false;
}

export default function SignupView() {
  const [allColumns, setAllColumns] = useState<string[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [rows, setRows] = useState<RowValues[]>([{ }]);

  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const [resizeMode, setResizeMode] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [loadingColumns, setLoadingColumns] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>("");

  const resizingRef = useRef<null | {
    key: string;
    startX: number;
    startW: number;
  }>(null);

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

  // 최초: 컬럼 로드 + 템플릿 자동 로드
  useEffect(() => {
    void loadColumns();

    try {
      const savedKeys = JSON.parse(localStorage.getItem(LS_SELECTED_KEYS) || "[]");
      if (Array.isArray(savedKeys)) setSelectedKeys(savedKeys.map(String));

      const savedWidths = JSON.parse(localStorage.getItem(LS_COL_WIDTHS) || "{}");
      if (savedWidths && typeof savedWidths === "object") {
        const next: Record<string, number> = {};
        for (const [k, v] of Object.entries(savedWidths)) {
          const n = Number(v);
          if (!Number.isFinite(n)) continue;
          next[String(k)] = Math.max(MIN_COL_WIDTH, n);
        }
        setColWidths(next);
      }
    } catch {
      // ignore
    }
  }, []);

  // 템플릿(선택 순서) 자동저장
  useEffect(() => {
    try {
      localStorage.setItem(LS_SELECTED_KEYS, JSON.stringify(selectedKeys));
    } catch {
      // ignore
    }
  }, [selectedKeys]);

  // 열넓이 자동저장
  useEffect(() => {
    try {
      localStorage.setItem(LS_COL_WIDTHS, JSON.stringify(colWidths));
    } catch {
      // ignore
    }
  }, [colWidths]);

  // 사용자 선택 순서 유지 + 현재 존재하는 컬럼만 필터
  const selectedColumns = useMemo(() => {
    const set = new Set(allColumns);
    return selectedKeys.filter((k) => set.has(k));
  }, [selectedKeys, allColumns]);

  const visibleRows = rows;

  function getColWidth(key: string) {
    const w = Number(colWidths[key]);
    if (Number.isFinite(w) && w > 0) return Math.max(MIN_COL_WIDTH, w);
    return DEFAULT_COL_WIDTH;
  }

  function setColWidth(key: string, w: number) {
    setColWidths((prev) => ({ ...prev, [key]: Math.max(MIN_COL_WIDTH, Math.floor(w)) }));
  }

  function add10Rows() {
    setRows((prev) => {
      const next = prev.slice();
      for (let i = 0; i < 10; i++) next.push({});
      return next;
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

    // 탭 없는 단일 값이면 기본 paste 처리
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

  function startResize(key: string, e: React.MouseEvent) {
    if (!resizeMode) return;
    e.preventDefault();
    e.stopPropagation();

    resizingRef.current = {
      key,
      startX: e.clientX,
      startW: getColWidth(key),
    };

    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const dx = ev.clientX - resizingRef.current.startX;
      setColWidth(resizingRef.current.key, resizingRef.current.startW + dx);
    };

    const onUp = () => {
      resizingRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
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

      // 전송 후 값 초기화(행 수는 유지)
      setRows((prev) => prev.map(() => ({})));
    } catch (e: any) {
      setError(e?.message || "전송에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  const showToolbar = selectedColumns.length > 0;

  return (
    <div className="w-full h-full flex flex-col p-3 gap-3 overflow-auto bg-white">
      <div className="flex items-center justify-between">
        <div className="text-base font-semibold text-slate-800">신규가입</div>

        <button
          type="button"
          className="text-xs px-3 py-2 border rounded bg-yellow-50 hover:bg-yellow-100 disabled:opacity-60"
          onClick={() => setPickerOpen(true)}
          disabled={loadingColumns}
        >
          양식
        </button>
      </div>

      {error && <div className="text-xs text-red-600">{error}</div>}

      {/* 양식으로 컬럼이 만들어지면, 그리드 좌측 상단에 버튼들 + 우측 끝 전송 */}
      {showToolbar && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="text-xs px-3 py-2 border rounded bg-white hover:bg-slate-50"
              onClick={add10Rows}
            >
              행10추가
            </button>

            <button
              type="button"
              className={`text-xs px-3 py-2 border rounded hover:bg-slate-50 ${
                resizeMode ? "bg-slate-800 text-white" : "bg-white"
              }`}
              onClick={() => setResizeMode((v) => !v)}
            >
              열넓이
            </button>
          </div>

          <button
            type="button"
            className="text-xs px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60"
            onClick={handleSubmit}
            disabled={submitting || loadingColumns}
          >
            {submitting ? "전송 중..." : "전송"}
          </button>
        </div>
      )}

      <div className="border rounded bg-white overflow-auto">
        {selectedColumns.length === 0 ? (
          <div className="p-3 text-xs text-slate-500">“양식”에서 컬럼을 선택하면 표가 생성됩니다.</div>
        ) : (
          <div className="min-w-max">
            {/* Header */}
            <div className="flex border-b bg-slate-100">
              {selectedColumns.map((k) => (
                <div
                  key={k}
                  className="relative px-2 py-2 text-[11px] font-semibold text-slate-700 border-r last:border-r-0 select-none"
                  style={{ width: getColWidth(k), minWidth: MIN_COL_WIDTH }}
                  title={k}
                >
                  <div className="truncate">{k}</div>

                  {resizeMode && (
                    <div
                      onMouseDown={(e) => startResize(k, e)}
                      className="absolute top-0 right-0 h-full w-[8px] cursor-col-resize"
                      title="드래그로 열넓이 조절"
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Body rows */}
            <div>
              {visibleRows.map((row, rowIndex) => (
                <div key={rowIndex} className="flex border-b last:border-b-0">
                  {selectedColumns.map((k, colIndex) => (
                    <div
                      key={`${rowIndex}-${k}`}
                      className="border-r last:border-r-0"
                      style={{ width: getColWidth(k), minWidth: MIN_COL_WIDTH }}
                    >
                      <input
                        className="w-full px-2 py-2 text-sm outline-none bg-white"
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
                  ))}
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