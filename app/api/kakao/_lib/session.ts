// app/api/kakao/_lib/session.ts
//
// 챗봇 세션 (PostgreSQL 기반)
// 한 번 전화번호 인증을 하면 30분간 다시 묻지 않는다.
//
// 저장하는 것: unified_id, 전화번호 뒷 4자리, 직전 의도, 수집 중인 값
// 저장하지 않는 것: 전화번호 전체, 이름, 주소

import { query } from "@/lib/db";

export type ChatSession = {
  userKey: string;
  unifiedId: number | null;
  phoneTail: string | null;
  intent: string | null;
  slots: Record<string, string>;
  turnCount: number;
};

const TTL_MINUTES = 30;

const EMPTY = (userKey: string): ChatSession => ({
  userKey,
  unifiedId: null,
  phoneTail: null,
  intent: null,
  slots: {},
  turnCount: 0,
});

export async function getSession(userKey: string): Promise<ChatSession> {
  if (!userKey) return EMPTY("");

  try {
    const r = await query(
      `SELECT user_key, unified_id, phone_tail, intent, slots, turn_count
       FROM kakao_sessions
       WHERE user_key = $1 AND expires_at > now()`,
      [userKey]
    );

    const row = r.rows?.[0];
    if (!row) return EMPTY(userKey);

    return {
      userKey,
      unifiedId: row.unified_id ?? null,
      phoneTail: row.phone_tail ?? null,
      intent: row.intent ?? null,
      slots: row.slots && typeof row.slots === "object" ? row.slots : {},
      turnCount: Number(row.turn_count ?? 0),
    };
  } catch (e) {
    console.error("[KAKAO_SESSION_GET]", e);
    return EMPTY(userKey);
  }
}

export async function setSession(
  userKey: string,
  patch: Partial<Omit<ChatSession, "userKey" | "turnCount">>
): Promise<void> {
  if (!userKey) return;

  try {
    await query(
      `INSERT INTO kakao_sessions
         (user_key, unified_id, phone_tail, intent, slots, turn_count, expires_at, updated_at)
       VALUES
         ($1, $2, $3, $4, COALESCE($5::jsonb, '{}'::jsonb), 1,
          now() + ($6 || ' minutes')::interval, now())
       ON CONFLICT (user_key) DO UPDATE SET
         unified_id = COALESCE(EXCLUDED.unified_id, kakao_sessions.unified_id),
         phone_tail = COALESCE(EXCLUDED.phone_tail, kakao_sessions.phone_tail),
         intent     = COALESCE(EXCLUDED.intent,     kakao_sessions.intent),
         slots      = kakao_sessions.slots || EXCLUDED.slots,
         turn_count = kakao_sessions.turn_count + 1,
         expires_at = now() + ($6 || ' minutes')::interval,
         updated_at = now()`,
      [
        userKey,
        patch.unifiedId ?? null,
        patch.phoneTail ?? null,
        patch.intent ?? null,
        patch.slots ? JSON.stringify(patch.slots) : null,
        String(TTL_MINUTES),
      ]
    );
  } catch (e) {
    console.error("[KAKAO_SESSION_SET]", e);
  }
}

export async function clearSession(userKey: string): Promise<void> {
  if (!userKey) return;
  try {
    await query(`DELETE FROM kakao_sessions WHERE user_key = $1`, [userKey]);
  } catch (e) {
    console.error("[KAKAO_SESSION_CLEAR]", e);
  }
}

/** 만료된 세션 정리. 100번에 1번꼴로만 실행해 부하를 줄인다. */
export async function sweepExpired(): Promise<void> {
  if (Math.random() > 0.01) return;
  try {
    await query(`DELETE FROM kakao_sessions WHERE expires_at < now() - interval '1 day'`);
  } catch {
    /* 실패해도 무시 */
  }
}
