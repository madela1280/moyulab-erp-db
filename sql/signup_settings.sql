CREATE TABLE IF NOT EXISTS signup_settings (
  id integer PRIMARY KEY,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 단일 row 고정 (id=1)
INSERT INTO signup_settings (id, settings)
VALUES (
  1,
  '{
    "selectedKeys": [],
    "colWidthSteps": {},
    "rowCount": 1,
    "partnerOptions": []
  }'::jsonb
)
ON CONFLICT (id) DO NOTHING;