-- 집계 > 설정(분류) 저장용 테이블
-- 거래처분류(대/중/소) + 가격(대여/연장, 일별)
-- (유축기 기종/거래유형 테이블 제거)

 /* 1) 거래처분류(대/중/소) */
CREATE TABLE IF NOT EXISTS agg_partner_categories (
  id SERIAL PRIMARY KEY,
  level SMALLINT NOT NULL CHECK (level IN (1, 2, 3)),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (level, name)
);

CREATE INDEX IF NOT EXISTS agg_partner_categories_level_idx
  ON agg_partner_categories(level);

 /* 2) 가격(대여/연장, 일별) */
CREATE TABLE IF NOT EXISTS agg_prices (
  id SERIAL PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('rent', 'extend')),
  unit TEXT NOT NULL DEFAULT 'day' CHECK (unit IN ('day')),
  amount INTEGER NOT NULL CHECK (amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kind, unit, amount)
);

CREATE INDEX IF NOT EXISTS agg_prices_kind_unit_idx
  ON agg_prices(kind, unit);