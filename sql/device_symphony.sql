-- 심포니 데이터(행)
CREATE TABLE IF NOT EXISTS device_symphony (
  id   SERIAL PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- 정렬/삽입용 sort_key
CREATE TABLE IF NOT EXISTS device_symphony_order (
  symphony_id INT PRIMARY KEY REFERENCES device_symphony(id) ON DELETE CASCADE,
  sort_key    NUMERIC NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_device_symphony_order_sort
ON device_symphony_order(sort_key, symphony_id);

-- 심포니 그리드 설정(전역 1행)
CREATE TABLE IF NOT EXISTS device_symphony_grid_settings (
  id   INT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb
);