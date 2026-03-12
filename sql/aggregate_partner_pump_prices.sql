-- 거래처별 유축기(모델) 단가 매핑
-- partner_name(문자열) × pump_model_id × kind(rent/extend) -> price_id(agg_prices)
-- 목적: 조리원처럼 "유축기별 단가"가 필요한 케이스를 세팅에서 여러 줄로 관리

/* 1) 유축기 모델 마스터 */
CREATE TABLE IF NOT EXISTS agg_pump_models (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

/* 2) 거래처×유축기×단가 매핑 */
CREATE TABLE IF NOT EXISTS agg_partner_pump_prices (
  partner_name TEXT NOT NULL,

  pump_model_id INT NOT NULL REFERENCES agg_pump_models(id) ON DELETE CASCADE,

  kind TEXT NOT NULL CHECK (kind IN ('rent', 'extend')),

  -- agg_prices(id) 중 kind/unit(day) 적합성은 API에서 검증
  price_id INT NOT NULL REFERENCES agg_prices(id) ON DELETE RESTRICT,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (partner_name, pump_model_id, kind)
);

CREATE INDEX IF NOT EXISTS agg_partner_pump_prices_partner_idx
  ON agg_partner_pump_prices(partner_name);

CREATE INDEX IF NOT EXISTS agg_partner_pump_prices_pump_idx
  ON agg_partner_pump_prices(pump_model_id);

CREATE INDEX IF NOT EXISTS agg_partner_pump_prices_price_idx
  ON agg_partner_pump_prices(price_id);