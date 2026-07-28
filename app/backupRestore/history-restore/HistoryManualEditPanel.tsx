// app/backupRestore/history-restore/HistoryManualEditPanel.tsx

"use client";

import {
  type HistoryOperationDetailResponse,
  type HistoryOperationItem,
} from "./serviceHistoryRestore";
import { useHistoryManualEdit } from "./useHistoryManualEdit";

function shortValue(value: any) {
  if (value === null || value === undefined) return "";

  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  try {
    const text = JSON.stringify(value);
    if (text.length > 160) return text.slice(0, 160) + "...";
    return text;
  } catch {
    return String(value);
  }
}

function canEditItem(item: HistoryOperationItem) {
  if (!item) return false;
  if (!item.unified_id) return false;
  if (!item.column_key) return false;

  return (
    item.action_type === "cell_update" ||
    item.action_type === "bulk_patch" ||
    item.action_type === "restore"
  );
}

function itemTitle(item: HistoryOperationItem) {
  const rowId = item.unified_id ?? "-";
  const col = item.column_key || "(행 전체)";
  return `row ${rowId} · ${col}`;
}

type HistoryManualEditPanelProps = {
  detail: HistoryOperationDetailResponse | null;
  loading?: boolean;
};

export default function HistoryManualEditPanel({
  detail,
  loading = false,
}: HistoryManualEditPanelProps) {
  const {
    editableItems,
    selectedItem,
    selectedItemId,
    draftValue,
    hasDraftChanged,
    selectItem,
    setDraftValue,
    fillFromBefore,
    fillFromAfter,
    fillFromCurrent,
    resetDraft,
  } = useHistoryManualEdit({
    detail,
    canEditItem,
  });

  if (!detail) {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-500">
        왼쪽 작업목록에서 작업을 선택하면 현재값 직접 수정 영역이 표시됩니다.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-500">
        수정 가능한 항목을 준비하는 중입니다.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-slate-800">
              현재값 직접 수정
            </div>
            <div className="mt-1 text-xs text-slate-500">
              과거값을 참고해서 현재값에 입력할 내용을 준비합니다. 저장 기능은 다음 단계에서 연결합니다.
            </div>
          </div>

          <div className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-500">
            수정 가능 {editableItems.length}건
          </div>
        </div>
      </div>

      <div className="p-4">
        {editableItems.length === 0 ? (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
            이 작업에는 현재 화면에서 직접 수정할 수 있는 셀 항목이 없습니다.
          </div>
        ) : (
          <div className="grid grid-cols-[280px_1fr] gap-4">
            <div className="min-h-[260px] max-h-[360px] overflow-auto rounded-md border border-slate-200">
              <div className="sticky top-0 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 border-b">
                수정할 항목 선택
              </div>

              <div className="divide-y divide-slate-100">
                {editableItems.map((item) => {
                  const selected = selectedItemId === item.id;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => selectItem(item.id)}
                      className={`block w-full px-3 py-2 text-left hover:bg-blue-50 ${
                        selected ? "bg-blue-50" : "bg-white"
                      }`}
                    >
                      <div className="text-xs font-semibold text-slate-800">
                        {itemTitle(item)}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        상태: {item.statusLabel}
                      </div>
                      <div className="mt-1 truncate text-xs text-slate-600">
                        현재값: {shortValue(item.current_value) || "(빈값)"}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="min-w-0 rounded-md border border-slate-200 overflow-hidden">
              {!selectedItem ? (
                <div className="p-4 text-sm text-slate-500">
                  왼쪽에서 수정할 항목을 선택하세요.
                </div>
              ) : (
                <>
                  <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-sm font-bold text-slate-800">
                      {itemTitle(selectedItem)}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      선택한 셀의 과거값과 현재값을 비교한 뒤 수정할 값을 입력합니다.
                    </div>
                  </div>

                  <div className="p-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                        <div className="text-xs font-semibold text-slate-500">
                          변경 전
                        </div>
                        <div
                          className="mt-2 min-h-[42px] break-words text-sm text-slate-800"
                          title={shortValue(selectedItem.before_value)}
                        >
                          {shortValue(selectedItem.before_value) || "(빈값)"}
                        </div>
                        <button
                          type="button"
                          onClick={fillFromBefore}
                          className="mt-3 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                        >
                          변경 전 값 가져오기
                        </button>
                      </div>

                      <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                        <div className="text-xs font-semibold text-slate-500">
                          변경 후
                        </div>
                        <div
                          className="mt-2 min-h-[42px] break-words text-sm text-slate-800"
                          title={shortValue(selectedItem.after_value)}
                        >
                          {shortValue(selectedItem.after_value) || "(빈값)"}
                        </div>
                        <button
                          type="button"
                          onClick={fillFromAfter}
                          className="mt-3 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                        >
                          변경 후 값 가져오기
                        </button>
                      </div>

                      <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                        <div className="text-xs font-semibold text-slate-500">
                          현재값
                        </div>
                        <div
                          className="mt-2 min-h-[42px] break-words text-sm text-slate-800"
                          title={shortValue(selectedItem.current_value)}
                        >
                          {shortValue(selectedItem.current_value) || "(빈값)"}
                        </div>
                        <button
                          type="button"
                          onClick={fillFromCurrent}
                          className="mt-3 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                        >
                          현재값 가져오기
                        </button>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="mb-2 flex items-center justify-between">
                        <label className="text-xs font-semibold text-slate-600">
                          수정할 현재값
                        </label>

                        {hasDraftChanged ? (
                          <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                            수정 준비됨
                          </span>
                        ) : (
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                            변경 없음
                          </span>
                        )}
                      </div>

                      <textarea
                        value={draftValue}
                        onChange={(e) => setDraftValue(e.target.value)}
                        className="h-28 w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        placeholder="현재값에 반영할 내용을 입력하세요."
                      />
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={resetDraft}
                        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        입력 초기화
                      </button>

                      <button
                        type="button"
                        disabled
                        title="저장 기능은 다음 단계에서 연결합니다."
                        className="rounded-md border border-slate-200 bg-slate-100 px-4 py-2 text-xs font-bold text-slate-400 cursor-not-allowed"
                      >
                        수정 저장 준비중
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}