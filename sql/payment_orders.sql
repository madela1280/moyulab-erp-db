-- sql/payment_orders.sql
-- 연장·연체료(추후 부품) 입금 대기 테이블 — 지시서 3장 초안 그대로
-- 실행: psql -U postgres -d erp -f sql/payment_orders.sql
-- ※ 이사님이 컬럼을 조정할 수 있음. 오늘 문자 파싱 테스트용 선반영.

CREATE TABLE IF NOT EXISTS payment_orders (
  id               serial PRIMARY KEY,
  order_type       text        NOT NULL CHECK (order_type IN ('extend','overdue','parts')),
  unified_id       int         NOT NULL,
  extend_days      int,
  current_end_date date,
  new_end_date     date,
  amount           int         NOT NULL,
  depositor_name   text,
  status           text        NOT NULL DEFAULT 'waiting'
                   CHECK (status IN ('waiting','matched','confirmed','expired','canceled')),
  kakao_user_key   text,
  expires_at       timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  confirmed_by     text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  confirmed_at     timestamptz,
  memo             text
);

-- 같은 대여건에 waiting 중복 금지
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_orders_waiting
  ON payment_orders (unified_id) WHERE status = 'waiting';

CREATE INDEX IF NOT EXISTS idx_payment_orders_status
  ON payment_orders (status, expires_at);

-- 문자 파싱 수신 원문 (매칭 실패 건 수동 처리 + 감사 추적)
CREATE TABLE IF NOT EXISTS sms_inbound (
  id          serial PRIMARY KEY,
  raw_text    text        NOT NULL,
  parsed_ok   boolean     NOT NULL DEFAULT false,
  amount      int,
  depositor   text,
  matched_id  int REFERENCES payment_orders(id),
  received_at timestamptz NOT NULL DEFAULT now()
);

-- holidays 테이블은 이사님이 이미 생성·운영 중 (컬럼: date, name)
-- 챗봇에서 공휴일 조회 시: SELECT date FROM holidays WHERE date = $1

-- ✅ 연장·연체료 ERP 화면(app/api/customer-reception/extend-orders/route.ts)이 온디맨드로
--   추가하는 컬럼(ensureExtendColumns()). 여기 문서에도 기록만 해둠 — 실제 적용은 API가 처음
--   호출될 때 자동으로 됨(ALTER TABLE ... ADD COLUMN IF NOT EXISTS, 기존 데이터 영향 없음).
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS unified_synced_at timestamptz;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS is_overdue_settlement boolean NOT NULL DEFAULT false;
