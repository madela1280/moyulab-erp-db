"use client";

import { useState } from "react";

type PreviewItem = {
  id: number;
  기기번호: string;
  수취인명: string;
  거래처분류: string;
  반납완료일: string;
  종료일: string;
};

const BATCH_LIMIT = 300;

export default function MoveToRecoveryPanel({
  open,
  onClose,
  onMoved,
}: {
  open: boolean;
  onClose: () => void;
  onMoved?: () => void;
}) {
  const [cutoff, setCutoff] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [items, setItems] = useState<PreviewItem[]>([]);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [resultMsg, setResultMsg] = useState("");

  if (!open) return null;

  async function handlePreview() {
    if (!cutoff) {
      setError("기준일을 먼저 선택하세요.");
      return;
    }

    setError("");
    setResultMsg("");
    setLoading(true);
    try {
      const r = await fetch(
        `/api/unified/move-to-recovery1?cutoff=${encodeURIComponent(cutoff)}&limit=${BATCH_LIMIT}`,
        { cache: "no-store" }
      );
      const j = await r.json().catch(() => null);

      if (!r.ok || !j?.ok) {
        setError("대상 조회 실패");
        setTotalCount(null);
        setItems([]);
        return;
      }

      setTotalCount(Number(j.totalCount ?? 0));
      const list: PreviewItem[] = Array.isArray(j.items) ? j.items : [];
      setItems(list);
      setCheckedIds(new Set(list.map((x) => x.id)));
    } catch {
      setError("대상 조회 실패(네트워크)");
    } finally {
      setLoading(false);
    }
  }

  function toggleId(id: number) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSend() {
    const ids = Array.from(checkedIds);
    if (!ids.length) {
      setError("이동할 행을 선택하세요.");
      return;
    }

    setError("");
    setLoading(true);
    try {
      const r = await fetch("/api/unified/move-to-recovery1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const j = await r.json().catch(() => null);

      if (!r.ok || !j?.ok) {
        setError("이동 실패");
        return;
      }

      setResultMsg(`${j.movedCount}건 이동 완료${j.skippedIds?.length ? ` (건너뜀 ${j.skippedIds.length}건)` : ""}`);
      setItems([]);
      setTotalCount(null);
      setCheckedIds(new Set());
      onMoved?.();
    } catch {
      setError("이동 실패(네트워크)");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] bg-black/30 flex items-center justify-center" onMouseDown={onClose}>
      <div
        className="w-[720px] max-w-[94vw] max-h-[86vh] rounded border bg-white shadow-lg flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b bg-slate-50">
          <div className="text-sm font-semibold text-slate-800">회수완료로 이동</div>
          <button type="button" className="text-xs px-2 py-1 border rounded bg-white hover:bg-slate-100" onClick={onClose}>
            닫기
          </button>
        </div>

        <div className="px-4 py-3 border-b flex items-center gap-2">
          <span className="text-xs text-slate-600">기준일(반납완료일이 이 날짜 이전)</span>
          <input
            type="date"
            className="text-xs px-2 py-1.5 border rounded"
            value={cutoff}
            onChange={(e) => setCutoff(e.target.value)}
          />
          <button
            type="button"
            className="text-xs px-3 py-1.5 border rounded bg-white hover:bg-slate-50"
            onClick={handlePreview}
            disabled={loading}
          >
            확인
          </button>

          {totalCount !== null && (
            <span className="text-xs text-slate-600">
              전체 대상 {totalCount.toLocaleString()}건 중 이번 목록 {items.length}건
            </span>
          )}
        </div>

        {error && <div className="px-4 py-2 text-xs text-red-600">{error}</div>}
        {resultMsg && <div className="px-4 py-2 text-xs text-emerald-700">{resultMsg}</div>}

        <div className="flex-1 min-h-0 overflow-auto">
          {items.length > 0 && (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white">
                <tr>
                  <th className="w-10 border-b px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={checkedIds.size === items.length}
                      onChange={(e) => {
                        setCheckedIds(e.target.checked ? new Set(items.map((x) => x.id)) : new Set());
                      }}
                    />
                  </th>
                  <th className="border-b px-2 py-1.5 text-left">기기번호</th>
                  <th className="border-b px-2 py-1.5 text-left">수취인명</th>
                  <th className="border-b px-2 py-1.5 text-left">거래처분류</th>
                  <th className="border-b px-2 py-1.5 text-left">반납완료일</th>
                  <th className="border-b px-2 py-1.5 text-left">종료일</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="odd:bg-white even:bg-slate-50">
                    <td className="border-b px-2 py-1 text-center">
                      <input type="checkbox" checked={checkedIds.has(it.id)} onChange={() => toggleId(it.id)} />
                    </td>
                    <td className="border-b px-2 py-1">{it.기기번호}</td>
                    <td className="border-b px-2 py-1">{it.수취인명}</td>
                    <td className="border-b px-2 py-1">{it.거래처분류}</td>
                    <td className="border-b px-2 py-1">{it.반납완료일}</td>
                    <td className="border-b px-2 py-1">{it.종료일}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!items.length && !loading && (
            <div className="px-4 py-8 text-center text-xs text-slate-400">
              기준일을 선택하고 확인을 눌러주세요.
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t flex items-center justify-end gap-2">
          <button
            type="button"
            className="text-xs px-3 py-2 border rounded bg-white hover:bg-slate-50 disabled:opacity-50"
            onClick={onClose}
            disabled={loading}
          >
            취소
          </button>
          <button
            type="button"
            className="text-xs px-3 py-2 border rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            onClick={handleSend}
            disabled={loading || !items.length}
          >
            전송({checkedIds.size}건)
          </button>
        </div>
      </div>
    </div>
  );
}
