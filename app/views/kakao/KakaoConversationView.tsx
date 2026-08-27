"use client";

// app/views/kakao/KakaoConversationView.tsx
//
// 카카오톡 > 대화조회. CS서버(moulab-customer-reception)의 챗봇 대화 로그(kakao_messages)를
// 고객별로 보여준다. 카카오 관리자 화면에서는 봇 대화가 안정적으로 안 보이므로(1:1채팅/상담톡 전부
// 챗봇과 병행 불가 확인됨) 여기서 조회한다 — 실시간 개입은 못 하고, 상황 파악 + 필요시 전화/문자용.

import { useEffect, useState } from "react";
import ConversationList from "@/views/kakao/conversation/ConversationList";
import ConversationThread from "@/views/kakao/conversation/ConversationThread";
import {
  fetchKakaoConversations,
  fetchKakaoConversationDetail,
  type KakaoConversationRow,
  type KakaoMessage,
} from "@/views/kakao/conversation/service";

export default function KakaoConversationView() {
  const [rows, setRows] = useState<KakaoConversationRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");

  const [selectedUserKey, setSelectedUserKey] = useState<string | null>(null);
  const [messages, setMessages] = useState<KakaoMessage[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  async function loadList() {
    setListLoading(true);
    setError("");
    try {
      const nextRows = await fetchKakaoConversations();
      setRows(nextRows);
    } catch (e: any) {
      setError(e?.message || "대화 목록을 불러오지 못했습니다.");
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    loadList();
  }, []);

  async function handleSelect(userKey: string) {
    setSelectedUserKey(userKey);
    setDetailLoading(true);
    try {
      const nextMessages = await fetchKakaoConversationDetail(userKey);
      setMessages(nextMessages);
    } catch (e: any) {
      setError(e?.message || "대화 내용을 불러오지 못했습니다.");
      setMessages([]);
    } finally {
      setDetailLoading(false);
    }
  }

  const filteredRows = rows.filter((r) => {
    const kw = keyword.trim();
    if (!kw) return true;
    return String(r.phone ?? "").includes(kw);
  });

  const selectedRow = rows.find((r) => r.userKey === selectedUserKey) || null;

  return (
    <div className="w-full h-full flex flex-col p-3 gap-3 bg-white">
      <div className="flex items-center gap-3">
        <div className="text-base font-semibold text-slate-800">카카오톡 대화조회</div>
        <div className="flex-1" />
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="전화번호 검색"
          className="border rounded px-2 py-1.5 text-xs w-48"
        />
        <button
          type="button"
          onClick={loadList}
          disabled={listLoading}
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {listLoading ? "불러오는 중..." : "새로고침"}
        </button>
      </div>

      {error && <div className="text-xs text-red-600">{error}</div>}

      <div className="flex-1 min-h-0 flex border border-slate-200 rounded overflow-hidden">
        <div className="w-72 flex-shrink-0 border-r border-slate-200 flex flex-col min-h-0">
          <ConversationList
            rows={filteredRows}
            loading={listLoading}
            selectedUserKey={selectedUserKey}
            onSelect={handleSelect}
          />
        </div>

        <ConversationThread phone={selectedRow?.phone ?? null} messages={messages} loading={detailLoading} />
      </div>
    </div>
  );
}
