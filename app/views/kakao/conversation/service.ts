// app/views/kakao/conversation/service.ts
//
// "카카오톡 > 대화조회" 데이터 조회. ERP 자체 API(/api/kakao-conversations)를 호출한다
// (CS서버 kakao_messages를 ERP가 중계 — CS서버 DB는 여기서 직접 안 건드림).

export type KakaoConversationRow = {
  userKey: string;
  phone: string | null;
  lastMessage: string;
  lastDirection: "in" | "out";
  lastMessageAt: string;
  messageCount: number;
  unread: boolean;
};

export type KakaoMessage = {
  direction: "in" | "out";
  content: string;
  blockName: string | null;
  createdAt: string;
};

type ApiRow = {
  user_key: string;
  phone: string | null;
  last_message: string;
  last_direction: "in" | "out";
  last_message_at: string;
  message_count: string | number;
  unread: boolean;
};

type ApiMessage = {
  direction: "in" | "out";
  content: string;
  block_name: string | null;
  created_at: string;
};

export async function fetchKakaoConversations(phone?: string): Promise<KakaoConversationRow[]> {
  const url = phone?.trim()
    ? `/api/kakao-conversations?phone=${encodeURIComponent(phone.trim())}`
    : "/api/kakao-conversations";

  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || "대화 목록을 불러오지 못했습니다.");
  }

  const rows: ApiRow[] = Array.isArray(data.rows) ? data.rows : [];
  return rows.map((r) => ({
    userKey: r.user_key,
    phone: r.phone,
    lastMessage: r.last_message,
    lastDirection: r.last_direction,
    lastMessageAt: r.last_message_at,
    messageCount: Number(r.message_count) || 0,
    unread: !!r.unread,
  }));
}

export async function markConversationRead(userKey: string): Promise<void> {
  try {
    await fetch(`/api/kakao-conversations/${encodeURIComponent(userKey)}`, { method: "POST" });
  } catch {
    // 읽음 처리 실패는 조용히 무시(화면 사용 자체를 막을 정도는 아님)
  }
}

export type AgentConnectRequestRow = {
  userKey: string;
  phone: string | null;
  requestedAt: string;
};

type ApiAgentConnectRow = {
  user_key: string;
  phone: string | null;
  created_at: string;
};

export async function fetchAgentConnectRequests(): Promise<AgentConnectRequestRow[]> {
  const res = await fetch("/api/agent-connect-requests", { cache: "no-store" });
  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || "상담원 연결 요청 목록을 불러오지 못했습니다.");
  }

  const rows: ApiAgentConnectRow[] = Array.isArray(data.rows) ? data.rows : [];
  return rows.map((r) => ({
    userKey: r.user_key,
    phone: r.phone,
    requestedAt: r.created_at,
  }));
}

/** 직원이 이 고객에게 답장 전송(카카오 Event API 능동발송) — 성공하면 봇은 이 고객에게 자동응답 안 함 */
export async function sendStaffReply(userKey: string, message: string): Promise<void> {
  const res = await fetch(`/api/kakao-conversations/${encodeURIComponent(userKey)}/reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || "답장을 보내지 못했습니다.");
  }
}

/** 상담종료 — 봇 자동응답을 다시 켠다 */
export async function endStaffHandling(userKey: string): Promise<void> {
  const res = await fetch(`/api/kakao-conversations/${encodeURIComponent(userKey)}/end-handling`, {
    method: "POST",
  });
  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || "상담 종료 처리에 실패했습니다.");
  }
}

export async function fetchKakaoConversationDetail(userKey: string): Promise<KakaoMessage[]> {
  const res = await fetch(`/api/kakao-conversations/${encodeURIComponent(userKey)}`, { cache: "no-store" });
  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || "대화 내용을 불러오지 못했습니다.");
  }

  const messages: ApiMessage[] = Array.isArray(data.messages) ? data.messages : [];
  return messages.map((m) => ({
    direction: m.direction,
    content: m.content,
    blockName: m.block_name,
    createdAt: m.created_at,
  }));
}
