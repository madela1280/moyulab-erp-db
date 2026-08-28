"use client";

// app/views/kakao/KakaoConversationView.tsx
//
// 카카오톡 > 대화조회. CS서버(moulab-customer-reception)의 챗봇 대화 로그(kakao_messages)를
// 고객별로 보여준다. 카카오 관리자 화면에서는 봇 대화가 안정적으로 안 보이므로(1:1채팅/상담톡 전부
// 챗봇과 병행 불가 확인됨) 여기서 조회한다 — 실시간 개입은 못 하고, 상황 파악 + 필요시 전화/문자용.
//
// 화면은 좌우 두 개로 분할된다: 왼쪽 = 전체 대화 목록, 오른쪽 = 상담원 연결을 요청한 고객 목록.
// 둘 다 "목록 클릭 → 대화 내용 보기"는 동일한 방식(ConversationThread 재사용).

import { useEffect, useState } from "react";
import ConversationList from "@/views/kakao/conversation/ConversationList";
import ConversationThread from "@/views/kakao/conversation/ConversationThread";
import AgentConnectList from "@/views/kakao/conversation/AgentConnectList";
import StaffReplyBox from "@/views/kakao/conversation/StaffReplyBox";
import {
  fetchKakaoConversations,
  fetchKakaoConversationDetail,
  fetchAgentConnectRequests,
  markConversationRead,
  type KakaoConversationRow,
  type KakaoMessage,
  type AgentConnectRequestRow,
} from "@/views/kakao/conversation/service";

export default function KakaoConversationView() {
  const [rows, setRows] = useState<KakaoConversationRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);

  const [selectedUserKey, setSelectedUserKey] = useState<string | null>(null);
  const [messages, setMessages] = useState<KakaoMessage[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // 오른쪽 패널(상담원 연결 요청) 전용 상태 — 왼쪽과 완전히 독립적으로 선택/조회된다.
  const [agentRows, setAgentRows] = useState<AgentConnectRequestRow[]>([]);
  const [agentListLoading, setAgentListLoading] = useState(false);
  const [agentSelectedUserKey, setAgentSelectedUserKey] = useState<string | null>(null);
  const [agentMessages, setAgentMessages] = useState<KakaoMessage[]>([]);
  const [agentDetailLoading, setAgentDetailLoading] = useState(false);

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

  async function loadAgentList() {
    setAgentListLoading(true);
    try {
      const nextRows = await fetchAgentConnectRequests();
      setAgentRows(nextRows);
    } catch (e: any) {
      setError(e?.message || "상담원 연결 요청 목록을 불러오지 못했습니다.");
    } finally {
      setAgentListLoading(false);
    }
  }

  useEffect(() => {
    loadList();
    loadAgentList();
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

    // 읽음 처리(실패해도 화면 사용엔 지장 없음) 후 목록의 안읽음 표시도 바로 지운다
    markConversationRead(userKey);
    setRows((prev) => prev.map((r) => (r.userKey === userKey ? { ...r, unread: false } : r)));
  }

  async function handleAgentSelect(userKey: string) {
    setAgentSelectedUserKey(userKey);
    setAgentDetailLoading(true);
    try {
      const nextMessages = await fetchKakaoConversationDetail(userKey);
      setAgentMessages(nextMessages);
    } catch (e: any) {
      setError(e?.message || "대화 내용을 불러오지 못했습니다.");
      setAgentMessages([]);
    } finally {
      setAgentDetailLoading(false);
    }
  }

  // 답장 전송 후 그 자리에서 바로 새 메시지가 보이도록 다시 불러온다(선택 상태는 그대로 유지).
  async function refreshAgentMessages() {
    if (!agentSelectedUserKey) return;
    try {
      const nextMessages = await fetchKakaoConversationDetail(agentSelectedUserKey);
      setAgentMessages(nextMessages);
    } catch {
      // 재조회 실패는 조용히 무시 — 다음 새로고침이나 재선택 시 다시 시도됨
    }
  }

  // 전화번호 검색은 안읽음 필터와 무관하게 항상 전체에서 찾는다(검색 중엔 안읽음 필터를 무시).
  const filteredRows = rows.filter((r) => {
    const kw = keyword.trim();
    if (kw) return String(r.phone ?? "").includes(kw);
    return !unreadOnly || r.unread;
  });

  const selectedRow = rows.find((r) => r.userKey === selectedUserKey) || null;
  const agentSelectedRow = agentRows.find((r) => r.userKey === agentSelectedUserKey) || null;
  const hasUnread = rows.some((r) => r.unread);

  return (
    <div className="w-full h-full flex flex-col p-3 gap-3 bg-white">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="text-base font-semibold text-slate-800">카카오톡 대화조회</div>
          {hasUnread && (
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" title="안읽은 대화 있음" />
          )}
        </div>
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
          onClick={() => {
            loadList();
            loadAgentList();
          }}
          disabled={listLoading}
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {listLoading ? "불러오는 중..." : "새로고침"}
        </button>
      </div>

      {error && <div className="text-xs text-red-600">{error}</div>}

      <div className="flex-1 min-h-0 flex gap-3">
        {/* 왼쪽 절반: 전체 대화 */}
        <div className="flex-1 min-w-0 flex border border-slate-200 rounded overflow-hidden">
          <div className="w-[280px] flex-shrink-0 border-r border-slate-200 flex flex-col min-h-0">
            <div className="flex items-center px-3 py-2 border-b border-slate-200">
              <button
                type="button"
                onClick={() => setUnreadOnly((prev) => !prev)}
                className={`rounded border px-2.5 py-1 text-[11px] font-medium ${
                  unreadOnly
                    ? "border-red-500 bg-red-50 text-red-700"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                안읽음만
              </button>
            </div>

            <ConversationList
              rows={filteredRows}
              loading={listLoading}
              selectedUserKey={selectedUserKey}
              onSelect={handleSelect}
            />
          </div>

          <ConversationThread phone={selectedRow?.phone ?? null} messages={messages} loading={detailLoading} />
        </div>

        {/* 오른쪽 절반: 상담원 연결 요청 */}
        <div className="flex-1 min-w-0 flex border-2 border-blue-200 rounded overflow-hidden">
          <div className="w-[280px] flex-shrink-0 border-r border-slate-200 flex flex-col min-h-0 bg-blue-50/30">
            <div className="px-3 py-2 border-b border-slate-200 text-xs font-semibold text-blue-700">
              상담원 연결 요청
            </div>

            <AgentConnectList
              rows={agentRows}
              loading={agentListLoading}
              selectedUserKey={agentSelectedUserKey}
              onSelect={handleAgentSelect}
            />
          </div>

          <div className="flex-1 min-w-0 flex flex-col min-h-0">
            <ConversationThread
              phone={agentSelectedRow?.phone ?? null}
              messages={agentMessages}
              loading={agentDetailLoading}
            />
            {agentSelectedUserKey && (
              <StaffReplyBox userKey={agentSelectedUserKey} onSent={refreshAgentMessages} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
