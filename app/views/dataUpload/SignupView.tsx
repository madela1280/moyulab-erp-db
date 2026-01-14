"use client";

import { useEffect, useMemo, useState } from "react";
import UnifiedColumnPickerModal from "@/views/dataUpload/components/UnifiedColumnPickerModal";
import { syncEmitUnifiedUpdate } from "@/global-sync/sync-engine";

type UnifiedColumnsResponse = {
  order: string[];
  custom?: Array<{ key: string; created_by?: string | null; created_at?: string | null }>;
};

export default function SignupView() {
  const [allColumns, setAllColumns] = useState<string[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [valuesByKey, setValuesByKey] = useState<Record<string, string>>({});

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
  }, []);

  // 선택된 컬럼이 바뀌어도 기존 입력값은 유지(선택에서 빠진 키는 그대로 두되, 폼 렌더만 안 함)
  const selectedColumns = useMemo(() => {
    const set = new Set(allColumns);
    const filtered = selectedKeys.filter((k) => set.has(k));
    // 사용자 선택 순서 유지
    return filtered;
  }, [selectedKeys, allColumns]);

  async function handleSubmit() {
    setError("");

    if (selectedColumns.length === 0) {
      setError("전송할 컬럼을 먼저 선택해 주세요.");
      return;
    }

    // JSONB에 저장할 payload (키=컬럼명)
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

      // 통합관리 갱신 알림
      syncEmitUnifiedUpdate();

      // 폼 초기화(선택은 유지/입력만 초기화)
      setValuesByKey({});
      alert("전송되었습니다. 통합관리의 마지막 데이터 다음 빈 행에 저장되었습니다.");
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
            통합관리 컬럼을 선택해 양식을 만들고, 입력 후 전송하면 통합관리 데이터로 저장됩니다.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-xs px-3 py-2 border rounded bg-slate-50 hover:bg-slate-100"
            onClick={() => setPickerOpen(true)}
            disabled={loadingColumns}
          >
            양식
          </button>

          <button
            type="button"
            className="text-xs px-3 py-2 border rounded bg-slate-800 text-white disabled:opacity-60"
            onClick={handleSubmit}
            disabled={submitting || loadingColumns}
          >
            {submitting ? "전송 중..." : "전송"}
          </button>
        </div>
      </div>

      {error && <div className="text-xs text-red-600">{error}</div>}

      <div className="border rounded p-3 bg-slate-50">
        <div className="text-xs font-semibold text-slate-700 mb-2">선택된 컬럼</div>
        {selectedColumns.length === 0 ? (
          <div className="text-xs text-slate-500">아직 선택된 컬럼이 없습니다. “양식” 버튼에서 체크하세요.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {selectedColumns.map((k) => (
              <span key={k} className="text-xs px-2 py-1 rounded border bg-white text-slate-700">
                {k}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="border rounded p-3">
        <div className="text-xs font-semibold text-slate-700 mb-2">입력</div>

        {selectedColumns.length === 0 ? (
          <div className="text-xs text-slate-500">양식에서 컬럼을 선택하면 입력칸이 생성됩니다.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {selectedColumns.map((k) => (
              <label key={k} className="flex flex-col gap-1">
                <span className="text-[11px] text-slate-600">{k}</span>
                <input
                  className="border rounded px-2 py-1 text-sm"
                  value={valuesByKey[k] ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setValuesByKey((prev) => ({ ...prev, [k]: v }));
                  }}
                  placeholder={`${k} 입력`}
                />
              </label>
            ))}
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

