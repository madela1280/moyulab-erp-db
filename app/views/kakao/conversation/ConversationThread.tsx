"use client";

// app/views/kakao/conversation/ConversationThread.tsx
// 선택된 고객의 전체 대화 내용(오른쪽 패널). 고객 발화는 왼쪽, 봇 응답은 오른쪽 말풍선.

import type { KakaoMessage } from "@/views/kakao/conversation/service";

// 로그 저장 형식이 "텍스트 / [이미지: url] / [이미지: url]" 식으로 이미지 URL을 텍스트에 박아 넣으므로
// (messageLog.js의 extractResponseText), 여기서 그 패턴을 뽑아서 실제 이미지로 보여준다.
const IMAGE_TAG_RE = /\[이미지:\s*(\S+?)\]/g;

// 고객이 채팅으로 사진을 직접 보내면(플러그인 안 거친 경우) 카카오가 그 사진의 CDN URL을 발화
// 원문 그대로 넘겨준다(대괄호 태그 없이) — 예: https://talk.kakaocdn.net/dna/.../i_xxx.jpg?credential=...
// 그래서 "전체 내용이 곧 이미지 URL 하나"인 경우도 이미지로 인식해서 보여준다.
function looksLikeBareImageUrl(text: string) {
  const trimmed = text.trim();
  if (!/^https?:\/\/\S+$/.test(trimmed)) return false;
  const withoutQuery = trimmed.split("?")[0];
  return /\.(jpe?g|png|gif|webp)$/i.test(withoutQuery) || trimmed.includes("kakaocdn.net");
}

function renderContent(content: string) {
  if (looksLikeBareImageUrl(content)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={content.trim()} alt="첨부 이미지" className="max-w-full rounded" />
    );
  }

  const parts: Array<{ type: "text" | "image"; value: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  IMAGE_TAG_RE.lastIndex = 0;
  while ((match = IMAGE_TAG_RE.exec(content))) {
    const before = content.slice(lastIndex, match.index).replace(/^\s*\/\s*|\s*\/\s*$/g, "").trim();
    if (before) parts.push({ type: "text", value: before });
    parts.push({ type: "image", value: match[1] });
    lastIndex = IMAGE_TAG_RE.lastIndex;
  }
  const rest = content.slice(lastIndex).replace(/^\s*\/\s*/, "").trim();
  if (rest) parts.push({ type: "text", value: rest });

  if (!parts.length) return <>{content}</>;

  return (
    <div className="flex flex-col gap-1.5">
      {parts.map((p, i) =>
        p.type === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={p.value} alt="첨부 이미지" className="max-w-full rounded" />
        ) : (
          <span key={i}>{p.value}</span>
        )
      )}
    </div>
  );
}

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

      <div className="flex-1 min-h-0 overflow-auto px-4 py-3 flex flex-col gap-2 bg-[#b2c7d9]">
        {messages.map((m, i) => {
          const isCustomer = m.direction === "in";
          return (
            <div key={i} className={`flex flex-col ${isCustomer ? "items-start" : "items-end"}`}>
              <div
                className={`max-w-[70%] rounded-2xl px-3 py-2 text-xs whitespace-pre-wrap shadow-sm ${
                  isCustomer
                    ? "bg-[#fee500] text-slate-900"
                    : "bg-white text-slate-900 border border-slate-200"
                }`}
              >
                {renderContent(m.content)}
              </div>
              <div className="mt-0.5 text-[10px] text-slate-500">{formatDateTime(m.createdAt)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
