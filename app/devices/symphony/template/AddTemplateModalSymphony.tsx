"use client";

import { useEffect, useMemo, useState } from "react";
import { symphonyColumns } from "@/devices/symphony/columns/symphonyColumns";

type Props = {
  open: boolean;
  onClose: () => void;

  // ✅ 양식추가/삭제 성공 직후, 상위에서 컬럼/그리드 즉시 갱신하기 위한 콜백
  onChanged?: () => void | Promise<void>;
};

type ColumnsResponse = {
  ok: true;
  order: string[];
};

export default function AddTemplateModalSymphony({ open, onClose, onChanged }: Props) {
  const baseSet = useMemo(() => new Set<string>([...symphonyColumns]), []);
  const [loading, setLoading] = useState(false);
  const [columns, setColumns] = useState<string[]>([]);

  const [name, setName] = useState("");
  const [referenceKey, setReferenceKey] = useState<string>(symphonyColumns[0] ?? "");
  const [position, setPosition] = useState<"after" | "before">("after");

  const customColumns = useMemo(() => columns.filter((c) => !baseSet.has(c)), [columns, baseSet]);

  async function loadColumns() {
    setLoading(true);
    try {
      const r = await fetch("/api/devices/symphony/columns", { cache: "no-store" });
      if (!r.ok) {
        setColumns([...(symphonyColumns as unknown as string[])]);
        return;
      }
      const j = (await r.json()) as Partial<ColumnsResponse>;
      const order = Array.isArray(j?.order) ? j!.order.map(String) : [];

      setColumns(order.length ? order : ([...(symphonyColumns as unknown as string[])] as string[]));
    } finally {
      setLoading(false);
    }
  }

  async function addTemplate() {
    const safeName = name.trim();
    if (!safeName) {
      alert("양식(컬럼) 이름을 입력해 주세요.");
      return;
    }
    if (!referenceKey) {
      alert("기준 컬럼을 선택해 주세요.");
      return;
    }

    const r = await fetch("/api/devices/symphony/columns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: safeName, referenceKey, position }),
    });

    if (!r.ok) {
      const t = await r.text().catch(() => "");
      alert(t || `FAILED(${r.status})`);
      return;
    }

    // ✅ 즉시 반영(상위에서 reloadAllColumnState + Grid remount 실행)
    await onChanged?.();

    // 모달 자체 목록 갱신
    setName("");
    await loadColumns();
  }

  async function deleteTemplate(key: string) {
    if (!confirm(`양식(컬럼) "${key}" 를 삭제할까요?`)) return;

    const r = await fetch(`/api/devices/symphony/columns/${encodeURIComponent(key)}`, {
      method: "DELETE",
    });

    if (!r.ok) {
      const t = await r.text().catch(() => "");
      alert(t || `FAILED(${r.status})`);
      return;
    }

    // ✅ 즉시 반영
    await onChanged?.();

    // 모달 목록 갱신
    await loadColumns();
  }

  useEffect(() => {
    if (!open) return;
    void loadColumns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/30" />

      <div className="relative w-[920px] max-w-[95vw] bg-white rounded shadow border">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="font-semibold text-slate-800">양식추가(새 컬럼 추가) / 양식삭제</div>
          <button className="px-3 py-1 border rounded hover:bg-gray-100" onClick={onClose}>
            닫기
          </button>
        </div>

        <div className="p-4 grid grid-cols-2 gap-4">
          {/* 추가 */}
          <div className="border rounded p-3">
            <div className="font-semibold text-slate-700 mb-3">추가</div>

            <div className="text-xs text-slate-600 mb-1">양식(컬럼) 이름</div>
            <input
              className="w-full h-9 px-2 border rounded mb-3"
              placeholder="예: 수리이력6"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-slate-600 mb-1">기준 컬럼</div>
                <select
                  className="w-full h-9 px-2 border rounded"
                  value={referenceKey}
                  onChange={(e) => setReferenceKey(e.target.value)}
                >
                  {(columns.length ? columns : [...symphonyColumns]).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="text-xs text-slate-600 mb-1">삽입 위치</div>
                <select
                  className="w-full h-9 px-2 border rounded"
                  value={position}
                  onChange={(e) => setPosition(e.target.value as any)}
                >
                  <option value="after">뒤(기준 컬럼 뒤)</option>
                  <option value="before">앞(기준 컬럼 앞)</option>
                </select>
              </div>
            </div>

            <div className="mt-3 text-[11px] text-slate-500">
              주의: 양식(컬럼)은 “전 사용자 공통” 구조 변경입니다.
            </div>

            <div className="mt-3 flex justify-end gap-2">
              <button className="px-3 py-2 border rounded hover:bg-gray-100" onClick={onClose}>
                취소
              </button>
              <button
                className="px-4 py-2 rounded bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40"
                disabled={loading}
                onClick={addTemplate}
              >
                추가
              </button>
            </div>
          </div>

          {/* 삭제 */}
          <div className="border rounded p-3">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-slate-700">삭제(커스텀 양식 목록)</div>
              <button className="px-3 py-1 border rounded hover:bg-gray-100" onClick={loadColumns}>
                새로고침
              </button>
            </div>

            {loading ? (
              <div className="text-sm text-slate-500 py-6 text-center">Loading...</div>
            ) : customColumns.length === 0 ? (
              <div className="text-sm text-slate-500 py-6 text-center">
                추가된 양식(커스텀 컬럼)이 없습니다.
              </div>
            ) : (
              <div className="max-h-[320px] overflow-auto border rounded">
                {customColumns.map((c) => (
                  <div
                    key={c}
                    className="flex items-center justify-between px-3 py-2 border-b last:border-b-0"
                  >
                    <div className="text-sm text-slate-800">{c}</div>
                    <button
                      className="px-3 py-1 border rounded hover:bg-gray-100"
                      onClick={() => deleteTemplate(c)}
                    >
                      삭제
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 text-[11px] text-slate-500">
              삭제는 “표시 컬럼”을 제거합니다. (기존 데이터 정리는 별도 작업으로 가능)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}