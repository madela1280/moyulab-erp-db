"use client";

import { useExcelBackup } from "@/backupRestore/excel-backup/useExcelBackup";

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

export default function ExcelBackupView() {
  const {
    backups,
    loading,
    creating,
    error,
    reload,
    createBackup,
    downloadBackup,
  } = useExcelBackup();

  const handleCreate = async () => {
    if (creating) return;

    const ok = window.confirm(
      [
        "현재 시점의 통합관리 데이터를 .xlsx 엑셀백업 파일로 생성할까요?",
        "",
        "생성된 파일은 서버에 저장되고, 목록에서 다운로드할 수 있습니다.",
      ].join("\n")
    );

    if (!ok) return;

    try {
      await createBackup();
      alert("엑셀백업이 생성되었습니다.");
    } catch {
      alert("엑셀백업 생성에 실패했습니다.");
    }
  };

  return (
    <div className="w-full h-full bg-white border rounded-md p-6 flex flex-col min-h-0">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-lg font-bold text-slate-800">엑셀백업</div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void reload()}
            disabled={loading || creating}
            className="px-3 py-2 rounded-md border border-slate-300 bg-white text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            새로고침
          </button>

          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={creating}
            className="px-3 py-2 rounded-md bg-slate-900 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {creating ? "엑셀 생성중..." : "수동생성"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          오류: {error}
        </div>
      )}

      <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        엑셀백업은 ERP 전체 복원용이 아니라 ERP 접속 불가 상황에서 임시 업무를 이어가기 위한
        업무연속용 백업입니다. 생성된 파일은 통합관리 데이터를 기준으로 만들어지며, PC 또는
        별도 보관 위치에 내려받아 보관할 수 있습니다.
      </div>

      <div className="mt-5 flex-1 min-h-0 overflow-auto border rounded-md">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 bg-slate-100 text-slate-700 border-b">
            <tr>
              <th className="px-3 py-2 text-left font-semibold w-[90px]">상태</th>
              <th className="px-3 py-2 text-left font-semibold">파일명</th>
              <th className="px-3 py-2 text-left font-semibold w-[100px]">행 수</th>
              <th className="px-3 py-2 text-left font-semibold w-[120px]">크기</th>
              <th className="px-3 py-2 text-left font-semibold w-[170px]">
                생성일자
              </th>
              <th className="px-3 py-2 text-left font-semibold w-[120px]">
                생성자
              </th>
              <th className="px-3 py-2 text-center font-semibold w-[110px]">
                다운로드
              </th>
            </tr>
          </thead>

          <tbody className="bg-white divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-slate-400">
                  엑셀백업 목록을 불러오는 중입니다.
                </td>
              </tr>
            ) : backups.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-slate-400">
                  생성된 엑셀백업이 없습니다.
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
                    {Number(b.row_count || 0).toLocaleString("ko-KR")}
                  </td>

                  <td className="px-3 py-2 text-slate-600">
                    {formatBytes(Number(b.file_size_bytes || 0))}
                  </td>

                  <td className="px-3 py-2 text-slate-600">
                    {formatDateTime(b.finished_at || b.created_at || null)}
                  </td>

                  <td className="px-3 py-2 text-slate-600">
                    {b.created_by_name || b.created_by_username || "-"}
                  </td>

                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center">
                      <button
                        type="button"
                        onClick={() => downloadBackup(b.id)}
                        disabled={b.status !== "success" || creating}
                        className="px-2 py-1 rounded border border-slate-300 bg-white text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                      >
                        다운로드
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