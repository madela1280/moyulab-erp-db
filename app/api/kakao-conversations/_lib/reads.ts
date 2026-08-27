// app/api/kakao-conversations/_lib/reads.ts
//
// "안읽음" 판정용 — 직원이 마지막으로 그 고객 대화를 연 시각을 ERP 자체 DB에 저장해둔다.
// (kakao_messages는 CS서버 DB에 있지만, "읽었는지"는 ERP 쪽 UI 상태라 ERP DB에 둔다.)

import { query } from "@/lib/db";

let tableEnsured = false;

async function ensureTable() {
  if (tableEnsured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS kakao_conversation_reads (
      user_key TEXT PRIMARY KEY,
      last_read_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  tableEnsured = true;
}

/** userKey -> lastReadAt(ISO) 맵. 한 번도 안 읽었으면 그 키 자체가 없음. */
export async function getLastReadMap(userKeys: string[]): Promise<Record<string, string>> {
  if (!userKeys.length) return {};
  await ensureTable();

  const r = await query(
    `SELECT user_key, last_read_at FROM kakao_conversation_reads WHERE user_key = ANY($1::text[])`,
    [userKeys]
  );

  const map: Record<string, string> = {};
  for (const row of r.rows || []) {
    map[row.user_key] = new Date(row.last_read_at).toISOString();
  }
  return map;
}

export async function markConversationRead(userKey: string): Promise<void> {
  await ensureTable();
  await query(
    `INSERT INTO kakao_conversation_reads (user_key, last_read_at)
     VALUES ($1, now())
     ON CONFLICT (user_key) DO UPDATE SET last_read_at = now()`,
    [userKey]
  );
}
