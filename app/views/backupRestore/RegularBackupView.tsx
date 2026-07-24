"use client";

import { useRegularBackup } from "@/backupRestore/regular-backup/useRegularBackup";

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "-";

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value = value / 1024;
    unitIndex++;
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDateTime(v: string | null) {
  if (!v) return "-";

  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";

  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status: string) {
  if (status === "success") return "성공";
  if (status === "running") return "진행중";
  if (status === "failed") return "실패";
  return status || "-";
}

function statusClassName(status: string) {
  if (status === "success") {
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }

  if (status === "running") {
    return "bg-amber-50 text-amber-700 border-amber-200";
  }

  if (status === "failed") {
    return "bg-rose-50 text-rose-700 border-rose-200";
  }

  return "bg-slate-50 text-slate-600 border-slate-200";
}

export default function RegularBackupView() {
  const {
    backups,
    loading,
    creating,
    deletingId,
    restoringId,
    error,
    reload,
    createBackup,
    removeBackup,
    restoreBackup,
    downloadBackup,
  } = useRegularBackup();

  const handleCreate = async () => {
    if (creating || restoringId) return;

    const ok = window.confirm(
      "현재 ERP PostgreSQL 전체 DB 백업을 생성할까요?\n백업 중에는 잠시 시간이 걸릴 수 있습니다."
    );
    if (!ok) return;

    try {
      await createBackup();
      alert("정기백업이 생성되었습니다.");
    } catch {
      alert("정기백업 생성에 실패했습니다.");
    }
  };

  const handleDelete = async (id: number, fileName: string) => {
    if (deletingId || restoringId) return;

    const ok = window.confirm(
      `선택한 백업 파일을 삭제할까요?\n\n${fileName}\n\n서버에 저장된 백업 파일과 목록 정보가 함께 삭제됩니다.`
    );
    if (!ok) return;

    try {
      await removeBackup(id);
      alert("백업이 삭제되었습니다.");
    } catch {
      alert("백업 삭제에 실패했습니다.");
    }
  };

  const handleRestore = async (id: number, fileName: string) => {
    if (restoringId || creating || deletingId) return;

    const firstOk = window.confirm(
      [
        "정말 이 백업 기준으로 ERP 전체 DB를 복원할까요?",
        "",
        fileName,
        "",
        "복원 전 현재 상태는 자동으로 한 번 더 안전백업됩니다.",
        "복원이 시작되면 ERP 전체 데이터가 선택한 백업 날짜 상태로 되돌아갑니다.",
        "이 작업은 매우 위험하므로 관리자만 실행해야 합니다.",
      ].join("\n")
    );

    if (!firstOk) return;

    const requiredConfirmText = `RESTORE:${fileName}`;
    const confirmText = window.prompt(
      [
        "복원을 계속하려면 아래 문구를 정확히 입력하세요.",
        "",
        requiredConfirmText,
      ].join("\n"),
      ""
    );

    if (confirmText !== requiredConfirmText) {
      alert("확인 문구가 일치하지 않아 복원을 취소합니다.");
      return;
    }

    const businessHourConfirm = window.prompt(
      [
        "업무시간 중 복원은 다른 사용자 작업에 영향을 줄 수 있습니다.",
        "복원을 계속하려면 아래 문구를 정확히 입력하세요.",
        "",
        "업무시간 복원 동의",
      ].join("\n"),
      ""
    );

    if (businessHourConfirm !== "업무시간 복원 동의") {
      alert("업무시간 복원 동의 문구가 일치하지 않아 복원을 취소합니다.");
      return;
    }

    const finalOk = window.confirm(
      [
        "마지막 확인입니다.",
        "",
        "ERP 전체 DB 복원을 지금 실행할까요?",
        "복원 중에는 ERP 사용을 중단해야 합니다.",
      ].join("\n")
    );

    if (!finalOk) return;

    try {
      await restoreBackup({
        id,
        confirmText,
        businessHourConfirm,
      });

      alert(
        "전체 복원이 완료되었습니다.\n화면을 새로고침하고 ERP 상태를 확인하세요."
      );

      window.location.reload();
    } catch {
      alert("전체 복원에 실패했습니다. 서버 로그를 확인해야 합니다.");
    }
  };

  return (
    <div className="w-full h-full bg-white border rounded-md p-6 flex flex-col min-h-0">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-lg font-bold text-slate-800">정기백업</div>
          <div className="mt-2 text-sm text-slate-500">
            ERP 전체 재해복구용 PostgreSQL 백업을 관리하는 화면입니다.
          </div>
          <div className="mt-1 text-xs text-rose-500">
            전체 복원은 선택한 백업 날짜 상태로 ERP 전체 DB를 되돌리는 위험 작업입니다.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void reload()}
            disabled={loading || creating || !!restoringId}
            className="px-3 py-2 rounded-md border border-slate-300 bg-white text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            새로고침
          </button>

          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={creating || !!restoringId}
            className="px-3 py-2 rounded-md bg-slate-900 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {creating ? "백업 생성중..." : "수동 백업 생성"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          오류: {error}
        </div>
      )}

      <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        정기백업은 셀/행 단위 실수 복구용이 아니라 ERP 전체를 특정 날짜 백업
        상태로 되돌리기 위한 최후 복구 장치입니다. 전체 복원 전에는 현재 상태가
        자동으로 한 번 더 안전백업됩니다.
      </div>

      <div className="mt-5 flex-1 min-h-0 overflow-auto border rounded-md">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 bg-slate-100 text-slate-700 border-b">
            <tr>
              <th className="px-3 py-2 text-left font-semibold w-[90px]">상태</th>
              <th className="px-3 py-2 text-left font-semibold">파일명</th>
              <th className="px-3 py-2 text-left font-semibold w-[120px]">크기</th>
              <th className="px-3 py-2 text-left font-semibold w-[170px]">
                생성 시작
              </th>
              <th className="px-3 py-2 text-left font-semibold w-[170px]">
                생성 완료
              </th>
              <th className="px-3 py-2 text-left font-semibold w-[120px]">
                생성자
              </th>
              <th className="px-3 py-2 text-center font-semibold w-[240px]">
                관리
              </th>
            </tr>
          </thead>

          <tbody className="bg-white divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-slate-400">
                  백업 목록을 불러오는 중입니다.
                </td>
              </tr>
            ) : backups.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-slate-400">
                  생성된 정기백업이 없습니다.
                </td>
              </tr>
            ) : (
              backups.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${statusClassName(
                        b.status
                      )}`}
                    >
                      {statusLabel(b.status)}
                    </span>
                  </td>

                  <td className="px-3 py-2 text-slate-700">
                    <div className="font-medium">{b.file_name}</div>
                    {b.error_message && (
                      <div className="mt-1 text-xs text-rose-600">
                        {b.error_message}
                      </div>
                    )}
                  </td>

                  <td className="px-3 py-2 text-slate-600">
                    {formatBytes(Number(b.file_size_bytes || 0))}
                  </td>

                  <td className="px-3 py-2 text-slate-600">
                    {formatDateTime(b.started_at)}
                  </td>

                  <td className="px-3 py-2 text-slate-600">
                    {formatDateTime(b.finished_at)}
                  </td>

                  <td className="px-3 py-2 text-slate-600">
                    {b.created_by_name || b.created_by_username || "-"}
                  </td>

                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => downloadBackup(b.id)}
                        disabled={b.status !== "success" || !!restoringId}
                        className="px-2 py-1 rounded border border-slate-300 bg-white text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                      >
                        다운로드
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleRestore(b.id, b.file_name)}
                        disabled={b.status !== "success" || restoringId === b.id || creating}
                        className="px-2 py-1 rounded border border-amber-300 bg-white text-xs text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                      >
                        {restoringId === b.id ? "복원중" : "복원"}
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleDelete(b.id, b.file_name)}
                        disabled={
                          deletingId === b.id ||
                          b.status === "running" ||
                          !!restoringId
                        }
                        className="px-2 py-1 rounded border border-rose-200 bg-white text-xs text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                      >
                        {deletingId === b.id ? "삭제중" : "삭제"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}