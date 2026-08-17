-- 모유랩 챗봇 — 이관 시각 컬럼 추가
--
-- 실행 (서버에서 1회):
--   psql -U postgres -d erp -f sql/kakao_sessions_slots.sql
--
-- slots(jsonb) · intent 컬럼은 이미 존재하므로 추가하지 않는다.
-- 대화 슬롯(stage/symptom/card_id/step_idx/attempts/guided)은
-- slots->'__dialog' 안에 넣는다. 슬롯이 늘어날 때 ALTER TABLE이 필요 없고,
-- 이사님 브랜치와 스키마 충돌도 생기지 않는다.
--
-- escalated_at만 별도 컬럼으로 두는 이유:
--   이관된 세션은 30분이 아니라 24시간 유지해야 하고,
--   그 판정을 SQL에서 해야 하기 때문.

ALTER TABLE kakao_sessions
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_kakao_sessions_escalated
  ON kakao_sessions (escalated_at)
  WHERE escalated_at IS NOT NULL;

-- 확인
--   \d kakao_sessions
--   SELECT user_key, intent, escalated_at, slots->'__dialog' AS dialog
--     FROM kakao_sessions ORDER BY updated_at DESC LIMIT 5;
