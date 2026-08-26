-- sql/payment_orders_packaging_columns.sql
--
-- 포장재구매(order_type='parts') 화면에서 쓰기 위해 payment_orders에 컬럼 추가.
-- 카카오 챗봇에서 받은 원본 정보(대여자명/연락처/발송주소/품목명)를 그대로 저장해 둔다.
-- (unified_id로 조인해서 가져올 수도 있지만, 고객이 챗봇에서 대여 시와 다른 주소/전화번호로
--  바꿨을 수 있어서 — 그 경우 unified 값과 다를 수 있으므로 챗봇이 받은 값 그대로 별도 저장한다.)
--
-- 실행: psql -U postgres -d erp -f sql/payment_orders_packaging_columns.sql
-- 기존 행에는 전부 NULL로 채워짐(문제없음 — order_type='extend'/'overdue' 건은 원래 안 쓰는 컬럼).

ALTER TABLE payment_orders
  ADD COLUMN IF NOT EXISTS renter_name       text,
  ADD COLUMN IF NOT EXISTS phone1            text,
  ADD COLUMN IF NOT EXISTS phone2            text,
  ADD COLUMN IF NOT EXISTS shipping_address  text,
  ADD COLUMN IF NOT EXISTS item_name         text;
