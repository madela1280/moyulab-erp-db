"use client";

export default function RegularBackupView() {
  return (
    <div className="w-full h-full bg-white border rounded-md p-6">
      <div className="text-lg font-bold text-slate-800">정기백업</div>
      <div className="mt-2 text-sm text-slate-500">
        매일 일정 시간에 생성되는 ERP 재해복구용 백업을 관리하는 화면입니다.
      </div>

      <div className="mt-6 rounded-md border border-dashed border-slate-300 p-5 text-sm text-slate-500">
        백업 목록, 다운로드, 삭제, 복원 기능이 이곳에 추가될 예정입니다.
      </div>
    </div>
  );
}