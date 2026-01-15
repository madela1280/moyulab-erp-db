"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import UnifiedColumnPickerModal from "@/views/dataUpload/components/UnifiedColumnPickerModal";
import { syncEmitUnifiedUpdate } from "@/global-sync/sync-engine";

type UnifiedColumnsResponse = {
  order: string[];
  custom?: Array<{ key: string; created_by?: string | null; created_at?: string | null }>;
};

function normalizeClipboardText(s: string) {
  return String(s ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export default function SignupView() {
  const [allColumns, setAllColumns] = useState<string[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [valuesByKey, setValuesByKey] = useState<Record<string, string>>({});

  const [pickerOpen, setPickerOpen] = useState(false);
  const [loadingColumns, setLoadingColumns] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>("");

  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

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
  }, []);

  // 사용자 선택 순서 유지 + 현재 존재하는 컬럼만 필터
  const selectedColumns = useMemo(() => {
    const set = new Set(allColumns);
    return selectedKeys.filter((k) => set.has(k));
  }, [selectedKeys, allColumns]);

  function focusCell(index: number) {
    const el = inputRefs.current[index];
    if (el) {
      el.focus();
      const len = el.value?.length ?? 0;
      try {
        el.setSelectionRange(len, len);
      } catch {
        // ignore
      }
    }
  }

  async function handleSubmit() {
    setError("");

    if (selectedColumns.length === 0) {
      setError("전송할 컬럼을 먼저 선택해 주세요.");
      return;
    }

    const data: Record<string, string> = {};
    for (const k of selectedColumns) {
      data[k] = String(valuesByKey[k] ?? "");
    }

    setSubmitting(true);
    try {
      const r = await fetch("/api/unified/signup-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data }),
      });

      if (!r.ok) {
        const t = await r.text().catch(() => "");
        throw new Error(t || `FAILED(${r.status})`);
      }

      syncEmitUnifiedUpdate();

      // 입력만 초기화(양식은 유지)
      setValuesByKey({});
      alert("전송되었습니다. 통합관리의 마지막 데이터 다음 빈 행에 저장되었습니다.");

      requestAnimationFrame(() => focusCell(0));
    } catch (e: any) {
      setError(e?.message || "전송에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full h-full flex flex-col p-3 gap-3 overflow-auto bg-white">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-base font-semibold text-slate-800">신규가입</div>
          <div className="text-xs text-slate-500 mt-1">
            통합관리 컬럼을 선택해 “엑셀형(1행 Grid)”으로 입력 후 전송하면 통합관리 데이터로 저장됩니다.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-xs px-3 py-2 border rounded bg-white hover:bg-slate-50 disabled:opacity-60"
            onClick={() => setPickerOpen(true)}
            disabled={loadingColumns}
          >
            양식
          </button>

          <button
            type="button"
            className="text-xs px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60"
            onClick={handleSubmit}
            disabled={submitting || loadingColumns}
          >
            {submitting ? "전송 중..." : "전송"}
          </button>
        </div>
      </div>

      {error && <div className="text-xs text-red-600">{error}</div>}

      <div className="border rounded bg-slate-50 p-3">
        <div className="text-xs font-semibold text-slate-700">입력 Grid</div>
        <div className="text-[11px] text-slate-500 mt-1">
          엑셀에서 한 행 복사 후 첫 칸에 붙여넣기(Ctrl+V)하면 탭(TSV) 기준으로 자동 분배됩니다.
        </div>

        <div className="mt-3 border rounded bg-white overflow-auto">
          {selectedColumns.length === 0 ? (
            <div className="p-3 text-xs text-slate-500">
              아직 선택된 컬럼이 없습니다. 우측 상단 “양식”에서 컬럼을 체크하세요.
            </div>
          ) : (
            <div className="min-w-max">
              {/* Header */}
              <div className="flex border-b bg-slate-100">
                {selectedColumns.map((k) => (
                  <div
                    key={k}
                    className="px-2 py-2 text-[11px] font-semibold text-slate-700 border-r last:border-r-0"
                    style={{ width: 160, minWidth: 160 }}
                    title={k}
                  >
                    <div className="truncate">{k}</div>
                  </div>
                ))}
              </div>

              {/* One input row */}
              <div className="flex">
                {selectedColumns.map((k, idx) => (
                  <div key={k} className="border-r last:border-r-0" style={{ width: 160, minWidth: 160 }}>
                    <input
                      ref={(el) => {
                        inputRefs.current[idx] = el;
                      }}
                      className="w-full px-2 py-2 text-sm outline-none"
                      value={valuesByKey[k] ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setValuesByKey((prev) => ({ ...prev, [k]: v }));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          focusCell(Math.min(idx + 1, selectedColumns.length - 1));
                        }
                      }}
                      onPaste={(e) => {
                        const text = normalizeClipboardText(e.clipboardData.getData("text"));
                        if (!text) return;

                        const lines = text.split("\n").filter((x) => x.length > 0);
                        if (lines.length === 0) return;

                        const firstLine = lines[0] ?? "";
                        const parts = firstLine.split("\t");

                        // 탭이 없으면 기본 paste 동작
                        if (parts.length < 2) return;

                        e.preventDefault();

                        setValuesByKey((prev) => {
                          const next = { ...prev };
                          for (let offset = 0; offset < parts.length; offset++) {
                            const colIndex = idx + offset;
                            if (colIndex >= selectedColumns.length) break;
                            const key = selectedColumns[colIndex];
                            next[key] = String(parts[offset] ?? "");
                          }
                          return next;
                        });

                        requestAnimationFrame(() => {
                          const lastIdx = Math.min(idx + parts.length - 1, selectedColumns.length - 1);
                          focusCell(lastIdx);
                        });
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
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