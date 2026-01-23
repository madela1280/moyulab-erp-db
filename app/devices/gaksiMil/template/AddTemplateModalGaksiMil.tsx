"use client";

import { useEffect, useMemo, useState } from "react";
import { gaksiMilColumns } from "@/devices/gaksiMil/columns/gaksiMilColumns";

type Props = {
  open: boolean;
  onClose: () => void;

  // 양식 추가/삭제 후 부모에서 컬럼/그리드 상태 재로딩 트리거
  onChanged: () => Promise<void> | void;
};

type Position = "after" | "before";

export default function AddTemplateModalGaksiMil({ open, onClose, onChanged }: Props) {
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<string[]>([]);
  const [error, setError] = useState<string>("");

  const [name, setName] = useState("");
  const [referenceKey, setReferenceKey] = useState("");
  const [position, setPosition] = useState<Position>("after");

  const baseSet = useMemo(() => new Set<string>([...(gaksiMilColumns as unknown as string[])]), []);

  const customColumns = useMemo(() => {
    return (order ?? []).filter((k) => !baseSet.has(k));
  }, [order, baseSet]);

  async function loadColumns() {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/devices/gaksiMil/columns", { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      const next = Array.isArray(j?.order) ? j.order.map(String) : [];
      setOrder(next);
      if (!referenceKey) {
        const first = next[0] ?? "";
        setReferenceKey(next.includes("제품명") ? "제품명" : first);
      }
    } catch (e: any) {
      setError(String(e?.message ?? e ?? "FAILED"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    void loadColumns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  async function handleAdd() {
    const n = name.trim();
    if (!n) return alert("추가할 컬럼명을 입력해 주세요.");
    if (!referenceKey) return alert("기준 컬럼을 선택해 주세요.");

    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/devices/gaksiMil/columns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: n,
          referenceKey,
          position,
        }),
      });

      if (!r.ok) {
        const t = await r.text().catch(() => "");
        throw new Error(t || `FAILED(${r.status})`);
      }

      setName("");
      await loadColumns();
      await onChanged();
    } catch (e: any) {
      setError(String(e?.message ?? e ?? "FAILED"));
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(key: string) {
    const k = String(key ?? "").trim();
    if (!k) return;

    if (baseSet.has(k)) {
      alert("기본 컬럼은 삭제할 수 없습니다.");
      return;
    }

    if (!confirm(`"${k}" 컬럼을 삭제할까요?`)) return;

    setLoading(true);
    setError("");
    try {
      const r = await fetch(`/api/devices/gaksiMil/columns/${encodeURIComponent(k)}`, {
        method: "DELETE",
      });

      if (!r.ok) {
        const t = await r.text().catch(() => "");
        throw new Error(t || `FAILED(${r.status})`);
      }

      await loadColumns();
      await onChanged();
    } catch (e: any) {
      setError(String(e?.message ?? e ?? "FAILED"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white w-[720px] max-w-[95vw] rounded shadow border"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="font-semibold text-slate-800">각시밀 양식(컬럼) 추가/삭제</div>
          <button
            className="px-3 py-1 border rounded hover:bg-gray-100 text-sm"
            onClick={onClose}
            type="button"
          >
            닫기
          </button>
        </div>

        <div className="p-4 grid grid-cols-2 gap-4">
          <div className="border rounded p-3">
            <div className="font-semibold text-slate-700 mb-2">양식 추가</div>

            <div className="flex flex-col gap-2">
              <label className="text-xs text-slate-600">새 컬럼명</label>
              <input
                className="border rounded px-2 py-1 text-sm"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 수리이력6"
                disabled={loading}
              />

              <label className="text-xs text-slate-600 mt-2">기준 컬럼</label>
              <select
                className="border rounded px-2 py-1 text-sm"
                value={referenceKey}
                onChange={(e) => setReferenceKey(e.target.value)}
                disabled={loading}
              >
                {(order.length ? order : [...(gaksiMilColumns as unknown as string[])]).map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>

              <label className="text-xs text-slate-600 mt-2">삽입 위치</label>
              <div className="flex items-center gap-3 text-sm">
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    checked={position === "before"}
                    onChange={() => setPosition("before")}
                    disabled={loading}
                  />
                  앞
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    checked={position === "after"}
                    onChange={() => setPosition("after")}
                    disabled={loading}
                  />
                  뒤
                </label>
              </div>

              <button
                className="mt-3 px-3 py-2 border rounded hover:bg-gray-50 text-sm"
                onClick={() => void handleAdd()}
                disabled={loading}
                type="button"
              >
                추가
              </button>
            </div>
          </div>

          <div className="border rounded p-3">
            <div className="font-semibold text-slate-700 mb-2">양식 삭제(커스텀만)</div>

            <div className="text-xs text-slate-500 mb-2">
              기본 컬럼은 삭제 불가. 커스텀 컬럼만 목록에 표시됩니다.
            </div>

            <div className="max-h-[260px] overflow-auto border rounded">
              {customColumns.map((k) => (
                <div key={k} className="flex items-center justify-between px-2 py-2 border-b last:border-b-0">
                  <div className="text-sm text-slate-800 truncate">{k}</div>
                  <button
                    className="px-2 py-1 border rounded hover:bg-gray-100 text-xs"
                    onClick={() => void handleDelete(k)}
                    disabled={loading}
                    type="button"
                  >
                    삭제
                  </button>
                </div>
              ))}

              {!customColumns.length && (
                <div className="px-2 py-3 text-sm text-slate-500">삭제할 커스텀 컬럼이 없습니다.</div>
              )}
            </div>

            <button
              className="mt-3 px-3 py-2 border rounded hover:bg-gray-50 text-sm"
              onClick={() => void loadColumns()}
              disabled={loading}
              type="button"
            >
              새로고침
            </button>
          </div>
        </div>

        {error && <div className="px-4 pb-4 text-sm text-red-600">{error}</div>}
      </div>
    </div>
  );
}