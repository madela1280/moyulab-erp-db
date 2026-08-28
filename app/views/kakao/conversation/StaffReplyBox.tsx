"use client";

// app/views/kakao/conversation/StaffReplyBox.tsx
//
// "상담원 연결 요청" 패널 전용 — 선택된 고객에게 직접 답장을 보낸다(카카오 Event API 능동발송).
// 전송 성공 시 그 고객은 봇 자동응답이 꺼지고(직원 응대 중 상태) 이 화면으로 계속 대화를 이어갈 수 있다.
// "상담종료"를 누르면 다시 봇이 응답하도록 되돌린다.

import { useState } from "react";
import { sendStaffReply, endStaffHandling } from "@/views/kakao/conversation/service";

type Props = {
  userKey: string;
  onSent: () => void;
};

export default function StaffReplyBox({ userKey, onSent }: Props) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState("");

  async function handleSend() {
    const message = text.trim();
    if (!message || sending) return;

    setSending(true);
    setError("");
    try {
      await sendStaffReply(userKey, message);
      setText("");
      onSent();
    } catch (e: any) {
      setError(e?.message || "답장을 보내지 못했습니다.");
    } finally {
      setSending(false);
    }
  }

  async function handleEnd() {
    if (ending) return;
    if (!window.confirm("상담을 종료하고 봇 자동응답을 다시 켜시겠습니까?")) return;

    setEnding(true);
    setError("");
    try {
      await endStaffHandling(userKey);
    } catch (e: any) {
      setError(e?.message || "상담 종료 처리에 실패했습니다.");
    } finally {
      setEnding(false);
    }
  }

  return (
    <div className="border-t border-slate-200 p-2 flex flex-col gap-1.5 bg-white">
      {error && <div className="text-[11px] text-red-600">{error}</div>}
      <div className="flex items-end gap-1.5">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="답장 입력 (Enter 전송, Shift+Enter 줄바꿈)"
          rows={2}
          className="flex-1 border rounded px-2 py-1.5 text-xs resize-none"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || !text.trim()}
          className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {sending ? "전송 중..." : "전송"}
        </button>
      </div>
      <button
        type="button"
        onClick={handleEnd}
        disabled={ending}
        className="self-end rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-50"
      >
        {ending ? "처리 중..." : "상담종료"}
      </button>
    </div>
  );
}
