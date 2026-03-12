-- 거래처별 집계 세팅 저장 테이블
-- 거래처분류(대/중/소)
-- (가격 기본값 rent_day_price_id / extend_day_price_id 제거)

CREATE TABLE IF NOT EXISTS agg_partner_settings (
  partner_name TEXT PRIMARY KEY,

  -- 거래처분류(대/중/소): agg_partner_categories(id) 참조
  partner_cat_l1_id INT NULL REFERENCES agg_partner_categories(id) ON DELETE SET NULL,
  partner_cat_l2_id INT NULL REFERENCES agg_partner_categories(id) ON DELETE SET NULL,
  partner_cat_l3_id INT NULL REFERENCES agg_partner_categories(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);