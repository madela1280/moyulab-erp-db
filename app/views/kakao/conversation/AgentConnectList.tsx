"use client";

// app/views/kakao/conversation/AgentConnectList.tsx
// 상담원 연결을 요청한 고객 목록(오른쪽 패널 안의 리스트). 왼쪽 대화목록과 동일한 방식으로 클릭해서 대화를 본다.

import type { AgentConnectRequestRow } from "@/views/kakao/conversation/service";

function formatDateTime(v: string) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${mi}`;
}

export default function AgentConnectList(props: {
  rows: AgentConnectRequestRow[];
  loading: boolean;
  selectedUserKey: string | null;
  onSelect: (userKey: string) => void;
}) {
  const { rows, loading, selectedUserKey, onSelect } = props;

  if (loading) {
    return <div className="p-4 text-xs text-slate-500">불러오는 중...</div>;
  }

  if (!rows.length) {
    return <div className="p-4 text-xs text-slate-400">상담원 연결 요청이 없습니다.</div>;
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto divide-y divide-slate-200">
      {rows.map((row) => {
        const selected = row.userKey === selectedUserKey;
        return (
          <button
            key={row.userKey}
            type="button"
            onClick={() => onSelect(row.userKey)}
            className={`block w-full text-left px-3 py-2.5 ${
              selected ? "bg-blue-50" : "hover:bg-slate-50"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-800">{row.phone || "번호 미확인"}</span>
              <span className="text-[11px] text-slate-400 whitespace-nowrap">
                {formatDateTime(row.requestedAt)}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
