"use client";

// app/views/kakao/conversation/ConversationList.tsx
// 고객별 대화 목록(왼쪽 패널). 최신순, 전화번호 검색 가능.

import type { KakaoConversationRow } from "@/views/kakao/conversation/service";

function formatDateTime(v: string) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${mi}`;
}

export default function ConversationList(props: {
  rows: KakaoConversationRow[];
  loading: boolean;
  selectedUserKey: string | null;
  onSelect: (userKey: string) => void;
}) {
  const { rows, loading, selectedUserKey, onSelect } = props;

  if (loading) {
    return <div className="p-4 text-xs text-slate-500">불러오는 중...</div>;
  }

  if (!rows.length) {
    return <div className="p-4 text-xs text-slate-400">대화 내역이 없습니다.</div>;
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
              <span className="flex items-center gap-1 whitespace-nowrap">
                {row.unread && (
                  <span className="flex items-center gap-0.5 text-[10px] text-red-600 font-medium">
                    <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                    안읽음
                  </span>
                )}
                <span className="text-[11px] text-slate-400">{formatDateTime(row.lastMessageAt)}</span>
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                  row.lastDirection === "in" ? "bg-slate-200 text-slate-600" : "bg-blue-100 text-blue-700"
                }`}
              >
                {row.lastDirection === "in" ? "고객" : "봇"}
              </span>
              <span className="text-xs text-slate-500 truncate">{row.lastMessage}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
