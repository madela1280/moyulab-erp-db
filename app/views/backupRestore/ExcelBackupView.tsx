"use client";

export default function ExcelBackupView() {
  return (
    <div className="w-full h-full bg-white border rounded-md p-6">
      <div className="text-lg font-bold text-slate-800">엑셀백업</div>
      <div className="mt-2 text-sm text-slate-500">
        ERP 접속 불가 상황에서도 업무를 이어가기 위한 통합관리 엑셀 백업 화면입니다.
      </div>

      <div className="mt-6 rounded-md border border-dashed border-slate-300 p-5 text-sm text-slate-500">
        통합관리 엑셀 생성, 다운로드, 마지막 생성 상태 확인 기능이 이곳에 추가될 예정입니다.
      </div>
    </div>
  );
}