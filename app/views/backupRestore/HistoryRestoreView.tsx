"use client";

import { useEffect } from "react";
import { useHistoryRestore } from "@/backupRestore/history-restore/useHistoryRestore";
import HistoryManualEditPanel from "@/backupRestore/history-restore/HistoryManualEditPanel";

function actionLabel(actionType: string) {
  if (actionType === "cell_update") return "수정";
  if (actionType === "bulk_patch") return "대량수정";
  if (actionType === "bulk_delete") return "삭제";
  if (actionType === "insert") return "행추가";
  if (actionType === "restore") return "복원";
  return actionType || "-";
}

function shortValue(value: any) {
  if (value === null || value === undefined) return "";

  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  try {
    const text = JSON.stringify(value);
    if (text.length > 120) return text.slice(0, 120) + "...";
    return text;
  } catch {
    return String(value);
  }
}

function statusClass(status: string) {
  if (status === "restorable") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "restored") return "bg-blue-50 text-blue-700 border-blue-200";
  if (status === "conflict") return "bg-red-50 text-red-700 border-red-200";
  if (status === "deleted") return "bg-orange-50 text-orange-700 border-orange-200";
  if (status === "already_deleted") return "bg-slate-50 text-slate-500 border-slate-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

export default function HistoryRestoreView() {
 const {
    mode,
    selectedDate,
    recent7Dates,

    operations,
    selectedOperationId,
    detail,

    loadingOperations,
    loadingDetail,

    error,
    message,
    restoreResult,

    loadToday,
    showRecent7Dates,
    loadDate,
    selectOperation,
  } = useHistoryRestore();

  useEffect(() => {
    loadToday();
  }, [loadToday]);

  return (
    <div className="w-full h-full bg-white border rounded-md p-6 overflow-hidden flex flex-col">
      <div className="shrink-0">
        <div className="text-lg font-bold text-slate-800">변경이력복원</div>
        <div className="mt-2 text-sm text-slate-500">
          통합관리 작업 중 발생한 입력, 삭제, 붙여넣기 이력을 과거값과 현재값으로 비교하는 화면입니다.
        </div>
      </div>

      <div className="mt-5 shrink-0 rounded-md border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={loadToday}
            disabled={loadingOperations}
            className={`rounded-md border px-4 py-2 text-sm font-semibold ${
              mode === "today"
                ? "border-blue-500 bg-blue-600 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            } disabled:opacity-60`}
          >
            오늘
          </button>

          <button
            type="button"
            onClick={showRecent7Dates}
            disabled={loadingOperations}
            className={`rounded-md border px-4 py-2 text-sm font-semibold ${
              mode === "recent7" || mode === "date"
                ? "border-blue-500 bg-blue-600 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            } disabled:opacity-60`}
          >
            최근 7일
          </button>

          <div className="ml-2 text-xs text-slate-500">
            오늘 또는 최근 7일 날짜를 선택한 뒤, 작업목록에서 비교할 작업을 고르세요.
          </div>
        </div>

        {(mode === "recent7" || mode === "date") && (
          <div className="mt-3 flex flex-wrap gap-2">
            {recent7Dates.map((date) => (
              <button
                key={date}
                type="button"
                onClick={() => loadDate(date)}
                disabled={loadingOperations}
                className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${
                  selectedDate === date
                    ? "border-indigo-500 bg-indigo-600 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                } disabled:opacity-60`}
              >
                {date}
              </button>
            ))}
          </div>
        )}

        {(error || message) && (
          <div className="mt-3 flex flex-col gap-1 text-sm">
            {error && <div className="text-red-600">{error}</div>}
            {message && <div className="text-slate-600">{message}</div>}
          </div>
        )}

        {restoreResult && (
          <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            복원 결과: 성공 {restoreResult.restoredCount}건 / 제외 {restoreResult.skippedCount}건
            {restoreResult.restoreOperationId ? (
              <span className="ml-2 text-xs text-emerald-600">
                복원ID: {restoreResult.restoreOperationId}
              </span>
            ) : null}
          </div>
        )}
      </div>

      <div className="mt-4 min-h-0 flex-1 grid grid-cols-[360px_1fr] gap-4">
        <div className="min-h-0 rounded-md border border-slate-200 overflow-hidden flex flex-col">
          <div className="shrink-0 border-b bg-slate-50 px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="font-bold text-slate-800">작업목록</div>
              <div className="text-xs text-slate-500">
                {loadingOperations ? "조회중..." : `${operations.length}건`}
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {operations.length === 0 ? (
              <div className="p-5 text-sm text-slate-500">
                조회된 작업이 없습니다.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {operations.map((op) => {
                  const selected = selectedOperationId === op.operation_id;

                  return (
                    <button
                      key={op.operation_id}
                      type="button"
                      onClick={() => selectOperation(op.operation_id)}
                      className={`block w-full px-4 py-3 text-left hover:bg-blue-50 ${
                        selected ? "bg-blue-50" : "bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-slate-800">
                          {op.created_time}
                        </div>
                        <div className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-600">
                          {actionLabel(op.action_type)}
                        </div>
                      </div>

                      <div className="mt-1 text-xs text-slate-500">
                        {op.created_date}
                      </div>

                      <div className="mt-1 text-sm text-slate-700 line-clamp-2">
                        {op.description || "-"}
                      </div>

                      <div className="mt-1 text-xs text-slate-500">
                        변경 {op.item_count}건 · {op.changed_by_name || op.changed_by_username || "-"}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="min-h-0 rounded-md border border-slate-200 overflow-hidden flex flex-col">
          <div className="shrink-0 border-b bg-slate-50 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-bold text-slate-800">상세 비교</div>
                <div className="mt-1 text-xs text-slate-500">
                  과거값과 현재값을 비교합니다. 현재값 직접 수정 기능은 다음 단계에서 연결합니다.
                </div>
              </div>

              <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
                아래 직접 수정 영역에서 과거값을 참고해 현재값 수정 내용을 준비할 수 있습니다.
              </div>
            </div>

            {detail && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-slate-600">
                  전체 {detail.summary.total}
                </span>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700">
                  복원가능 {detail.summary.restorable}
                </span>
                <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-blue-700">
                  복원완료 {detail.summary.restored}
                </span>
                <span className="rounded-full border border-red-200 bg-red-50 px-2 py-1 text-red-700">
                  충돌 {detail.summary.conflict}
                </span>
                <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-1 text-orange-700">
                  현재행없음 {detail.summary.deleted}
                </span>
              </div>
            )}
          </div>

                    <div className="min-h-0 flex-1 overflow-auto">
            {!detail ? (
              <div className="p-6 text-sm text-slate-500">
                왼쪽 작업목록에서 비교할 작업을 선택하세요.
              </div>
            ) : loadingDetail ? (
              <div className="p-6 text-sm text-slate-500">상세 조회중...</div>
            ) : (
              <div className="min-w-[980px]">
                <div className="p-4">
                  <HistoryManualEditPanel detail={detail} loading={loadingDetail} />
                </div>

                <table className="w-full border-collapse text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-100">
                    <tr className="border-b border-slate-200 text-xs text-slate-600">
                      <th className="w-12 px-2 py-2 text-center">구분</th>
                      <th className="w-20 px-2 py-2 text-left">row id</th>
                      <th className="w-28 px-2 py-2 text-left">컬럼</th>
                      <th className="px-2 py-2 text-left">변경 전</th>
                      <th className="px-2 py-2 text-left">변경 후</th>
                      <th className="px-2 py-2 text-left">현재값</th>
                      <th className="w-24 px-2 py-2 text-center">상태</th>
                    </tr>
                  </thead>

                  <tbody>
                    {detail.items.map((item) => {
                      return (
                        <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-2 py-2 text-center">
                            <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-500">
                              비교
                            </span>
                          </td>

                          <td className="px-2 py-2 text-slate-700">
                            {item.unified_id ?? "-"}
                          </td>

                          <td className="px-2 py-2 text-slate-700">
                            {item.column_key || "(행 전체)"}
                          </td>

                          <td className="max-w-[260px] px-2 py-2 text-slate-700">
                            <div className="truncate" title={shortValue(item.before_value)}>
                              {shortValue(item.before_value)}
                            </div>
                          </td>

                          <td className="max-w-[260px] px-2 py-2 text-slate-700">
                            <div className="truncate" title={shortValue(item.after_value)}>
                              {shortValue(item.after_value)}
                            </div>
                          </td>

                          <td className="max-w-[260px] px-2 py-2 text-slate-700">
                            <div className="truncate" title={shortValue(item.current_value)}>
                              {shortValue(item.current_value)}
                            </div>
                          </td>

                          <td className="px-2 py-2 text-center">
                            <span
                              className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass(
                                item.status
                              )}`}
                            >
                              {item.statusLabel}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {restoreResult?.skipped?.length ? (
            <div className="shrink-0 border-t bg-orange-50 px-4 py-3 text-xs text-orange-700">
              제외 항목 {restoreResult.skipped.length}건:
              <span className="ml-2">
                {restoreResult.skipped
                  .slice(0, 3)
                  .map((x) => x.message)
                  .join(" / ")}
                {restoreResult.skipped.length > 3 ? " ..." : ""}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}