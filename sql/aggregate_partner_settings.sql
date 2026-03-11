-- 거래처별 집계 세팅 저장 테이블
-- (거래유형 제외) 거래처분류(대/중/소) + 가격(대여/연장 일별) + 유축기 기종

CREATE TABLE IF NOT EXISTS agg_partner_settings (
  partner_name TEXT PRIMARY KEY,

  -- 거래처분류(대/중/소): agg_partner_categories(id) 참조
  partner_cat_l1_id INT NULL REFERENCES agg_partner_categories(id) ON DELETE SET NULL,
  partner_cat_l2_id INT NULL REFERENCES agg_partner_categories(id) ON DELETE SET NULL,
  partner_cat_l3_id INT NULL REFERENCES agg_partner_categories(id) ON DELETE SET NULL,

  -- 유축기 기종: agg_pump_models(id) 참조
  pump_model_id INT NULL REFERENCES agg_pump_models(id) ON DELETE SET NULL,

  -- 가격(대여/연장, 일별): agg_prices(id) 참조 (kind/unit은 앱에서 검증)
  rent_day_price_id INT NULL REFERENCES agg_prices(id) ON DELETE SET NULL,
  extend_day_price_id INT NULL REFERENCES agg_prices(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agg_partner_settings_pump_model_idx
  ON agg_partner_settings(pump_model_id);

CREATE INDEX IF NOT EXISTS agg_partner_settings_rent_price_idx
  ON agg_partner_settings(rent_day_price_id);

CREATE INDEX IF NOT EXISTS agg_partner_settings_extend_price_idx
  ON agg_partner_settings(extend_day_price_id);