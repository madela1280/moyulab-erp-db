"use client";

import { useEffect, useMemo, useState } from "react";

type CustomColumn = {
  key: string;
  created_by?: string | null;
  created_at?: string | null;
};

export default function AddTemplateModal({
  open,
  onClose,
  referenceOptions,
  onAdd,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  referenceOptions: string[];
  onAdd: (payload: { name: string; referenceKey: string; position: "after" | "before" }) => Promise<void>;
  onDelete: (key: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [referenceKey, setReferenceKey] = useState("");
  const [position, setPosition] = useState<"after" | "before">("after");

  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState<string>("");

  const defaultRef = useMemo(() => referenceOptions[0] ?? "", [referenceOptions]);

  async function loadCustomList() {
    setLoadingList(true);
    try {
      const r = await fetch("/api/unified-columns", { cache: "no-store" });
      if (!r.ok) return;

      const j = await r.json();
      const list = Array.isArray(j?.custom) ? j.custom : [];
      setCustomColumns(
        list
          .map((x: any) => ({
            key: String(x?.key ?? ""),
            created_by: x?.created_by ?? null,
            created_at: x?.created_at ?? null,
          }))
          .filter((x: CustomColumn) => !!x.key)
      );
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    if (!open) return;

    setName("");
    setPosition("after");
    setReferenceKey(defaultRef);
    setError("");

    void loadCustomList();
  }, [open, defaultRef]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/30 flex items-center justify-center" onMouseDown={onClose}>
      <div
        className="bg-white w-[680px] max-w-[95vw] rounded border shadow p-4"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-800">양식추가(새 컬럼 추가) / 양식삭제</div>
          <button className="text-xs px-2 py-1 border rounded bg-slate-50" onClick={onClose}>
            닫기
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-4">
          {/* 왼쪽: 추가 */}
          <div className="space-y-3 text-xs">
            <div className="text-slate-700 font-semibold">추가</div>

            <div>
              <div className="text-slate-700 mb-1">양식(컬럼) 이름</div>
              <input
                className="w-full border rounded px-2 py-1"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 재방문일 / 메모3 ..."
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-slate-700 mb-1">기준 컬럼</div>
                <select
                  className="w-full border rounded px-2 py-1"
                  value={referenceKey}
                  onChange={(e) => setReferenceKey(e.target.value)}
                >
                  {referenceOptions.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="text-slate-700 mb-1">삽입 위치</div>
                <select
                  className="w-full border rounded px-2 py-1"
                  value={position}
                  onChange={(e) => setPosition(e.target.value as any)}
                >
                  <option value="after">뒤(기준 컬럼 뒤)</option>
                  <option value="before">앞(기준 컬럼 앞)</option>
                </select>
              </div>
            </div>

            <div className="text-[11px] text-slate-500">
              주의: 양식(컬럼)은 “전체 사용자 공통” 구조 변경입니다.
            </div>

            {error && <div className="text-red-600">{error}</div>}

            <div className="flex justify-end gap-2 pt-2">
              <button className="text-xs px-3 py-1 border rounded bg-slate-50" onClick={onClose} disabled={loading}>
                취소
              </button>

              <button
                className="text-xs px-3 py-1 border rounded bg-slate-800 text-white disabled:opacity-60"
                disabled={loading}
                onClick={async () => {
                  setError("");
                  const nm = name.trim();
                  if (!nm) return setError("이름을 입력해 주세요.");
                  if (!referenceKey) return setError("기준 컬럼을 선택해 주세요.");

                  setLoading(true);
                  try {
                    await onAdd({ name: nm, referenceKey, position });
                    await loadCustomList();
                    setName("");
                  } catch (e: any) {
                    setError(e?.message || "저장에 실패했습니다.");
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                {loading ? "추가 중..." : "추가"}
              </button>
            </div>
          </div>

          {/* 오른쪽: 삭제 */}
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <div className="text-slate-700 font-semibold">삭제(커스텀 양식 목록)</div>
              <button
                className="text-[11px] px-2 py-1 border rounded bg-white hover:bg-slate-50"
                onClick={() => void loadCustomList()}
                disabled={loadingList}
                type="button"
              >
                {loadingList ? "새로고침..." : "새로고침"}
              </button>
            </div>

            {customColumns.length === 0 ? (
              <div className="text-slate-500">{loadingList ? "불러오는 중..." : "추가된 양식(커스텀 컬럼)이 없습니다."}</div>
            ) : (
              <div className="border rounded divide-y max-h-[260px] overflow-auto">
                {customColumns.map((c) => (
                  <div key={c.key} className="flex items-center justify-between px-2 py-2">
                    <div className="min-w-0">
                      <div className="text-slate-800 truncate">{c.key}</div>
                      <div className="text-[11px] text-slate-500">
                        {c.created_by ? `by ${c.created_by}` : ""}
                        {c.created_at ? ` · ${c.created_at}` : ""}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="text-[11px] px-2 py-1 border rounded bg-white hover:bg-red-50 hover:border-red-200 hover:text-red-700"
                      disabled={loading}
                      onClick={async () => {
                        const ok = window.confirm(`"${c.key}" 양식을 삭제할까요?\n(컬럼 표시만 제거되며, 기존 행 data(JSONB)는 그대로 남을 수 있습니다.)`);
                        if (!ok) return;

                        setError("");
                        setLoading(true);
                        try {
                          await onDelete(c.key);
                          await loadCustomList();
                        } catch (e: any) {
                          setError(e?.message || "삭제에 실패했습니다.");
                        } finally {
                          setLoading(false);
                        }
                      }}
                    >
                      삭제
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="text-[11px] text-slate-500">
              삭제는 “표시 컬럼”을 제거합니다. (기존 데이터 정리는 별도 작업으로 가능)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}