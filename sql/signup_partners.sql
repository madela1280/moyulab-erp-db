-- 신규가입 전용 거래처 목록 테이블
CREATE TABLE IF NOT EXISTS signup_partners (
  id INTEGER PRIMARY KEY,
  partners JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 기본 row(단일 row) 보장
INSERT INTO signup_partners (id, partners)
VALUES (1, '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;