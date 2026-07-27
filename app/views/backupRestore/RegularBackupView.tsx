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

function backupKindLabel(kind: string) {
  if (kind === "pre_restore") return "복원전 안전백업";
  if (kind === "regular") return "정기백업";
  return kind || "-";
}

function backupKindClassName(kind: string) {
  if (kind === "pre_restore") {
    return "bg-amber-50 text-amber-700 border-amber-200";
  }

  return "bg-slate-50 text-slate-600 border-slate-200";
}

export default function RegularBackupView() {
  const {
    backups,
    latestPreRestore,
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
        "이 작업은 매우 위험하므로 관리자 비밀번호 확인 후 실행됩니다.",
      ].join("\n")
    );

    if (!firstOk) return;

    const adminPassword = window.prompt(
      [
        "복원을 계속하려면 관리자 비밀번호를 입력하세요.",
        "",
        "관리자 비밀번호는 서버에서 다시 검증됩니다.",
      ].join("\n"),
      ""
    );

    if (!adminPassword) {
      alert("관리자 비밀번호가 입력되지 않아 복원을 취소합니다.");
      return;
    }

    const restoreReason =
      window.prompt(
        [
          "복원 사유를 입력하세요.",
          "",
          "예: 테스트 복원, 데이터 오류 확인, 장애 복구 등",
        ].join("\n"),
        ""
      ) || "";

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
        adminPassword,
        restoreReason,
      });

      alert(
        "전체 복원이 완료되었습니다.\n화면을 새로고침하고 ERP 상태를 확인하세요."
      );

      window.location.reload();
    } catch {
      alert("전체 복원에 실패했습니다. 관리자 비밀번호 또는 서버 로그를 확인해야 합니다.");
    }
  };

  const handleRestoreCancel = async () => {
    if (restoringId || creating || deletingId || !latestPreRestore) return;

    const firstOk = window.confirm(
      [
        "가장 최근 복원 직전 상태로 되돌릴까요?",
        "",
        latestPreRestore.file_name,
        "",
        "이 기능은 마지막 복원 실행 직전에 자동 생성된 안전백업으로 ERP 전체 DB를 되돌립니다.",
        "복원취소도 전체 DB 복원이므로 관리자 비밀번호 확인 후 실행됩니다.",
      ].join("\n")
    );

    if (!firstOk) return;

    const adminPassword = window.prompt(
      [
        "복원취소를 계속하려면 관리자 비밀번호를 입력하세요.",
        "",
        "관리자 비밀번호는 서버에서 다시 검증됩니다.",
      ].join("\n"),
      ""
    );

    if (!adminPassword) {
      alert("관리자 비밀번호가 입력되지 않아 복원취소를 취소합니다.");
      return;
    }

    const restoreReason =
      window.prompt(
        [
          "복원취소 사유를 입력하세요.",
          "",
          "예: 복원 결과 확인 후 직전 상태로 되돌림",
        ].join("\n"),
        "복원취소"
      ) || "복원취소";

    const finalOk = window.confirm(
      [
        "마지막 확인입니다.",
        "",
        "복원 직전 상태로 지금 되돌릴까요?",
        "진행 중에는 ERP 사용을 중단해야 합니다.",
      ].join("\n")
    );

    if (!finalOk) return;

    try {
      await restoreBackup({
        id: latestPreRestore.id,
        adminPassword,
        restoreReason,
      });

      alert(
        "복원취소가 완료되었습니다.\n화면을 새로고침하고 ERP 상태를 확인하세요."
      );

      window.location.reload();
    } catch {
      alert("복원취소에 실패했습니다. 관리자 비밀번호 또는 서버 로그를 확인해야 합니다.");
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
            onClick={() => void handleRestoreCancel()}
            disabled={!latestPreRestore || creating || !!restoringId}
            title={
              latestPreRestore
                ? "가장 최근 복원 직전 상태로 되돌립니다."
                : "복원 실행 전 자동 생성된 안전백업이 아직 없습니다."
            }
            className="px-3 py-2 rounded-md border border-amber-300 bg-white text-sm text-amber-700 hover:bg-amber-50 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:hover:bg-slate-100 disabled:cursor-not-allowed"
          >
            복원취소
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
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium">{b.file_name}</div>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${backupKindClassName(
                          b.backup_kind
                        )}`}
                      >
                        {backupKindLabel(b.backup_kind)}
                      </span>
                    </div>

                    {(b as any).restore_reason && (
                      <div className="mt-1 text-xs text-slate-500">
                        복원사유: {(b as any).restore_reason}
                      </div>
                    )}

                    {(b as any).restore_target_file_name && (
                      <div className="mt-1 text-xs text-slate-400">
                        대상백업: {(b as any).restore_target_file_name}
                      </div>
                    )}

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