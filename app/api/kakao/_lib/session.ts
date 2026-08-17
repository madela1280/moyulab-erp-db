// app/api/kakao/_lib/session.ts
//
// 챗봇 세션 (PostgreSQL 기반)
// 한 번 전화번호 인증을 하면 30분간 다시 묻지 않는다.
// 상담원 이관된 세션은 24시간 유지한다 (상담원이 이어받는 동안 컨텍스트 보존).
//
// 저장하는 것: unified_id, 전화번호 뒷 4자리, 직전 의도, 대화 슬롯
// 저장하지 않는 것: 전화번호 전체, 이름, 주소
//
// 대화 슬롯은 slots->'__dialog' 에 넣는다. 컬럼을 추가하지 않으므로
// 슬롯이 늘어날 때 이사님 브랜치와 스키마 충돌이 생기지 않는다.

import { query } from "@/lib/db";
import { DIALOG_KEY, EMPTY_DIALOG, isEscalated, parseDialog, type Dialog } from "./slots";

export type ChatSession = {
  userKey: string;
  unifiedId: number | null;
  phoneTail: string | null;
  /** 직전 턴의 의도. "얼마에요?" 같은 생략 발화 해석에 쓴다 */
  intent: string | null;
  /** __dialog 를 제외한 나머지 수집값 */
  slots: Record<string, any>;
  /** 대화 진행 상태 */
  dialog: Dialog;
  turnCount: number;
};

const TTL_MINUTES = 30;
const TTL_ESCALATED_MINUTES = 60 * 24;

const EMPTY = (userKey: string): ChatSession => ({
  userKey,
  unifiedId: null,
  phoneTail: null,
  intent: null,
  slots: {},
  dialog: { ...EMPTY_DIALOG },
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

    const rawSlots =
      row.slots && typeof row.slots === "object" && !Array.isArray(row.slots) ? row.slots : {};

    const { [DIALOG_KEY]: rawDialog, ...rest } = rawSlots as Record<string, any>;

    return {
      userKey,
      unifiedId: row.unified_id ?? null,
      phoneTail: row.phone_tail ?? null,
      intent: row.intent ?? null,
      slots: rest,
      dialog: parseDialog(rawDialog),
      turnCount: Number(row.turn_count ?? 0),
    };
  } catch (e) {
    console.error("[KAKAO_SESSION_GET]", e);
    return EMPTY(userKey);
  }
}

type SessionPatch = {
  unifiedId?: number | null;
  phoneTail?: string | null;
  intent?: string | null;
  /** 얕은 병합된다 (기존 키 유지) */
  slots?: Record<string, any>;
  /** 통째로 교체된다 */
  dialog?: Dialog;
};

export async function setSession(userKey: string, patch: SessionPatch): Promise<void> {
  if (!userKey) return;

  // dialog 는 부분 병합하면 guided 배열이 섞이므로 통째로 덮어쓴다
  const merged: Record<string, any> | null =
    patch.slots || patch.dialog
      ? { ...(patch.slots ?? {}), ...(patch.dialog ? { [DIALOG_KEY]: patch.dialog } : {}) }
      : null;

  const escalated = patch.dialog ? isEscalated(patch.dialog) : false;
  const ttl = escalated ? TTL_ESCALATED_MINUTES : TTL_MINUTES;

  try {
    await query(
      `INSERT INTO kakao_sessions
         (user_key, unified_id, phone_tail, intent, slots, turn_count,
          escalated_at, expires_at, updated_at)
       VALUES
         ($1, $2, $3, $4, COALESCE($5::jsonb, '{}'::jsonb), 1,
          CASE WHEN $7 THEN now() ELSE NULL END,
          now() + ($6 || ' minutes')::interval, now())
       ON CONFLICT (user_key) DO UPDATE SET
         unified_id   = COALESCE(EXCLUDED.unified_id, kakao_sessions.unified_id),
         phone_tail   = COALESCE(EXCLUDED.phone_tail, kakao_sessions.phone_tail),
         intent       = COALESCE(EXCLUDED.intent,     kakao_sessions.intent),
         slots        = kakao_sessions.slots || EXCLUDED.slots,
         turn_count   = kakao_sessions.turn_count + 1,
         escalated_at = CASE WHEN $7 THEN now() ELSE NULL END,
         expires_at   = now() + ($6 || ' minutes')::interval,
         updated_at   = now()`,
      [
        userKey,
        patch.unifiedId ?? null,
        patch.phoneTail ?? null,
        patch.intent ?? null,
        merged ? JSON.stringify(merged) : null,
        String(ttl),
        escalated,
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
