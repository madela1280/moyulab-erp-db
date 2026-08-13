-- sql/kakao_sessions.sql
-- 챗봇 세션 저장 테이블
-- 실행: psql -U postgres -d erp -f sql/kakao_sessions.sql
--
-- 목적: 고객이 한 번 전화번호 인증을 하면 30분간 다시 묻지 않기 위한 저장소.
-- Redis 대신 PostgreSQL을 쓰는 이유: 새 환경변수·새 의존성 없이 기존 DB만으로 동작.

BEGIN;

CREATE TABLE IF NOT EXISTS kakao_sessions (
  user_key    TEXT PRIMARY KEY,              -- 카카오 botUserKey
  unified_id  INT,                           -- 인증된 대여건 id
  phone_tail  TEXT,                          -- 표시용 뒷 4자리 (전체 번호는 저장하지 않음)
  intent      TEXT,                          -- 직전 의도
  slots       JSONB NOT NULL DEFAULT '{}'::jsonb,
  turn_count  INT NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_kakao_sessions_expires
  ON kakao_sessions (expires_at);

-- 전화번호 조회 성능 확보 (통합관리 37,000건 풀스캔 방지)
-- 이게 없으면 카카오 5초 제한에 걸릴 수 있음
CREATE INDEX IF NOT EXISTS ix_unified_phone1
  ON unified ((regexp_replace(COALESCE(data->>'연락처1',''), '[^0-9]', '', 'g')));

CREATE INDEX IF NOT EXISTS ix_unified_phone2
  ON unified ((regexp_replace(COALESCE(data->>'연락처2',''), '[^0-9]', '', 'g')));

COMMIT;
