-- sql/unified_change_history.sql
-- 변경이력복원 1단계: 통합관리 변경이력 저장용 테이블
-- 목적:
-- 1) 사용자가 저장한 작업을 operation 단위로 묶어 저장
-- 2) 각 operation 안의 실제 셀/행 변경 내역을 item 단위로 저장
-- 3) 복원 시 before/after/current 비교가 가능하도록 값 보관
-- 4) 7일 보관 정책 적용을 위한 created_at 인덱스 준비

CREATE TABLE IF NOT EXISTS unified_change_operations (
  id BIGSERIAL PRIMARY KEY,

  -- 한 번의 사용자 저장 작업을 묶는 고유 ID
  operation_id TEXT NOT NULL UNIQUE,

  -- 현재는 unified만 사용
  domain TEXT NOT NULL DEFAULT 'unified',

  -- 내부 기록용 작업 유형
  -- 예: cell_update, bulk_patch, bulk_delete, insert, restore
  action_type TEXT NOT NULL,

  -- 작업자 정보
  changed_by_username TEXT,
  changed_by_name TEXT,

  -- 해당 작업에 포함된 변경 item 수
  item_count INTEGER NOT NULL DEFAULT 0,

  -- 화면 표시용 설명
  description TEXT,

  -- 복원 작업일 경우 원본 operation 연결
  restored_from_operation_id TEXT,

  -- 복원 사유
  restore_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS unified_change_items (
  id BIGSERIAL PRIMARY KEY,

  -- unified_change_operations.operation_id 참조
  operation_id TEXT NOT NULL REFERENCES unified_change_operations(operation_id) ON DELETE CASCADE,

  -- 대상 unified row id
  unified_id INTEGER,

  -- 대상 컬럼명
  -- 행 삭제/행 삽입처럼 행 단위 작업이면 NULL 가능
  column_key TEXT,

  -- 셀 단위 변경 전/후 값
  before_value JSONB,
  after_value JSONB,

  -- 행 단위 복원/삭제 복원을 위한 변경 전/후 row data
  before_row_data JSONB,
  after_row_data JSONB,

  -- item 단위 작업 유형
  -- 예: cell_update, bulk_patch, bulk_delete, insert, restore
  action_type TEXT NOT NULL,

  -- 복원 작업일 경우 원본 item 연결
  restored_from_item_id BIGINT REFERENCES unified_change_items(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 작업 목록 조회용: 오늘/최근7일/사용자 기준
CREATE INDEX IF NOT EXISTS idx_unified_change_operations_created_at
ON unified_change_operations(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_unified_change_operations_user_created_at
ON unified_change_operations(changed_by_username, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_unified_change_operations_action_created_at
ON unified_change_operations(action_type, created_at DESC);

-- 상세 조회/복원 비교용
CREATE INDEX IF NOT EXISTS idx_unified_change_items_operation_id
ON unified_change_items(operation_id);

CREATE INDEX IF NOT EXISTS idx_unified_change_items_unified_id
ON unified_change_items(unified_id);

CREATE INDEX IF NOT EXISTS idx_unified_change_items_column_key
ON unified_change_items(column_key);

CREATE INDEX IF NOT EXISTS idx_unified_change_items_created_at
ON unified_change_items(created_at DESC);