-- recovery_complete.sql
-- 회수완료(회수1/회수2) 이력 저장용 테이블 세트
-- 실행: psql -U postgres -d erp -f sql/recovery_complete.sql

/* -------------------------------------------------------------------------- */
/* recovery1                                                                  */
/* -------------------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS recovery1 (
  id   SERIAL PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS recovery1_order (
  recovery1_id INT PRIMARY KEY REFERENCES recovery1(id) ON DELETE CASCADE,
  sort_key NUMERIC NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recovery1_order_sort
ON recovery1_order(sort_key, recovery1_id);

-- order 누락 보정(안전)
INSERT INTO recovery1_order (recovery1_id, sort_key)
SELECT r.id, (ROW_NUMBER() OVER (ORDER BY r.id)) * 1000
FROM recovery1 r
WHERE NOT EXISTS (
  SELECT 1 FROM recovery1_order o WHERE o.recovery1_id = r.id
);

-- 유저별 그리드 설정
CREATE TABLE IF NOT EXISTS recovery1_grid_settings (
  username text PRIMARY KEY,
  column_order jsonb NOT NULL,
  col_width_unit_by_key jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

/* -------------------------------------------------------------------------- */
/* recovery2                                                                  */
/* -------------------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS recovery2 (
  id   SERIAL PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS recovery2_order (
  recovery2_id INT PRIMARY KEY REFERENCES recovery2(id) ON DELETE CASCADE,
  sort_key NUMERIC NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recovery2_order_sort
ON recovery2_order(sort_key, recovery2_id);

-- order 누락 보정(안전)
INSERT INTO recovery2_order (recovery2_id, sort_key)
SELECT r.id, (ROW_NUMBER() OVER (ORDER BY r.id)) * 1000
FROM recovery2 r
WHERE NOT EXISTS (
  SELECT 1 FROM recovery2_order o WHERE o.recovery2_id = r.id
);

-- 유저별 그리드 설정
CREATE TABLE IF NOT EXISTS recovery2_grid_settings (
  username text PRIMARY KEY,
  column_order jsonb NOT NULL,
  col_width_unit_by_key jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);