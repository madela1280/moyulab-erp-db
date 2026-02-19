-- sql/sms_core.sql
--
-- 문자(알림톡/SMS 대체) 집계/발송 로그/템플릿 매핑 테이블
-- - unified는 원천 데이터
-- - sms_targets: "발송을 위한 집계 스냅샷" (base_date + sub_category 기준)
-- - sms_template_map: 소카테고리×안내분류 → 템플릿/채널/대체발송 설정 + 템플릿 원문(치환 전)
-- - sms_send_logs: 실제 발송 요청/응답 추적(감사/디버깅)

BEGIN;

-- 1) 집계 대상(스냅샷)
CREATE TABLE IF NOT EXISTS sms_targets (
  id BIGSERIAL PRIMARY KEY,

  unified_id INT NOT NULL,
  sub_category TEXT NOT NULL CHECK (sub_category IN ('대여첫안내','만기3일전','만기지남')),
  base_date DATE NOT NULL,

  -- snapshot (unified에서 복사)
  guide_name TEXT NULL,
  recipient_name TEXT NULL,
  phone1 TEXT NULL,
  phone2 TEXT NULL,
  address TEXT NULL,

  shipped_date TEXT NULL,
  start_date TEXT NULL,
  end_date TEXT NULL,
  return_request_date TEXT NULL,
  return_complete_date TEXT NULL,

  derived_status TEXT NULL,
  end_date_display TEXT NULL,

  -- 집계/발송 상태
  target_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (target_status IN ('pending','sending','sent','success','fail','excluded')),

  -- SENS 추적용(최근값)
  last_request_id TEXT NULL,
  last_message_id TEXT NULL,
  last_failover_message_id TEXT NULL,
  last_result_code TEXT NULL,
  last_result_desc TEXT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 같은 unified 행이 같은 날짜/소카테고리로 중복 집계되는 것을 막는다.
CREATE UNIQUE INDEX IF NOT EXISTS ux_sms_targets_unified_sub_date
  ON sms_targets (unified_id, sub_category, base_date);

CREATE INDEX IF NOT EXISTS ix_sms_targets_lookup
  ON sms_targets (base_date, sub_category, target_status);

-- 2) 템플릿 매핑(소카테고리×안내분류)
CREATE TABLE IF NOT EXISTS sms_template_map (
  id BIGSERIAL PRIMARY KEY,

  sub_category TEXT NOT NULL CHECK (sub_category IN ('대여첫안내','만기3일전','만기지남')),
  -- 안내분류: null이면 default 템플릿
  guide_name TEXT NULL,

  template_code TEXT NOT NULL,
  plus_friend_id TEXT NOT NULL,

  use_sms_failover BOOLEAN NOT NULL DEFAULT false,
  -- failover 발신번호(콘솔 등록된 번호)
  failover_from TEXT NULL,

  -- 승인된 템플릿 원문(치환 전): 예) "... 만기일 #{날짜,요일} 입니다."
  template_body TEXT NOT NULL,

  -- 템플릿이 버튼을 요구하는 경우 그대로 저장해 발송 요청에 전달
  -- SENS AlimTalk buttons 형식과 동일한 구조(JSON 배열)
  buttons_json JSONB NULL,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- (sub_category, guide_name) 조합은 1개만
CREATE UNIQUE INDEX IF NOT EXISTS ux_sms_template_map_sub_guide
  ON sms_template_map (sub_category, guide_name);

-- 3) 발송 로그(감사/디버깅)
CREATE TABLE IF NOT EXISTS sms_send_logs (
  id BIGSERIAL PRIMARY KEY,

  batch_id TEXT NOT NULL,
  target_id BIGINT NOT NULL REFERENCES sms_targets(id) ON DELETE CASCADE,
  unified_id INT NOT NULL,

  sub_category TEXT NOT NULL,
  base_date DATE NOT NULL,

  -- SENS 응답 추적
  request_id TEXT NULL,
  message_id TEXT NULL,
  status_code TEXT NULL,
  status_name TEXT NULL,
  request_status_code TEXT NULL,
  request_status_desc TEXT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_sms_send_logs_batch
  ON sms_send_logs (batch_id);

CREATE INDEX IF NOT EXISTS ix_sms_send_logs_target
  ON sms_send_logs (target_id);

COMMIT;