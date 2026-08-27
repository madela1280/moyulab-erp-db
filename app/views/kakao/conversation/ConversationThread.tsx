"use client";

// app/views/kakao/conversation/ConversationThread.tsx
// 선택된 고객의 전체 대화 내용(오른쪽 패널). 고객 발화는 왼쪽, 봇 응답은 오른쪽 말풍선.

import type { KakaoMessage } from "@/views/kakao/conversation/service";

function formatDateTime(v: string) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

export default function ConversationThread(props: {
  phone: string | null;
  messages: KakaoMessage[];
  loading: boolean;
}) {
  const { phone, messages, loading } = props;

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-xs text-slate-500">불러오는 중...</div>;
  }

  if (!messages.length) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
        왼쪽에서 대화를 선택하세요.
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-4 py-2.5 border-b border-slate-200 text-xs font-semibold text-slate-700">
        {phone || "번호 미확인"}
      </div>

      <div className="flex-1 min-h-0 overflow-auto px-4 py-3 flex flex-col gap-2">
        {messages.map((m, i) => {
          const isCustomer = m.direction === "in";
          return (
            <div key={i} className={`flex flex-col ${isCustomer ? "items-start" : "items-end"}`}>
              <div
                className={`max-w-[70%] rounded-lg px-3 py-2 text-xs whitespace-pre-wrap ${
                  isCustomer ? "bg-slate-100 text-slate-800" : "bg-blue-500 text-white"
                }`}
              >
                {m.content}
              </div>
              <div className="mt-0.5 text-[10px] text-slate-400">
                {formatDateTime(m.createdAt)}
                {m.blockName ? ` · ${m.blockName}` : ""}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
