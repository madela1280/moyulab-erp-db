"use client";

export default function HistoryRestoreView() {
  return (
    <div className="w-full h-full bg-white border rounded-md p-6">
      <div className="text-lg font-bold text-slate-800">변경이력복원</div>
      <div className="mt-2 text-sm text-slate-500">
        통합관리 작업 중 발생한 입력, 삭제, 붙여넣기 실수를 이력 기반으로 선택 복원하는 화면입니다.
      </div>

      <div className="mt-6 rounded-md border border-dashed border-slate-300 p-5 text-sm text-slate-500">
        변경이력 조회, 현재값/과거값 비교, 충돌 검사, 선택 복원 기능이 이곳에 추가될 예정입니다.
      </div>
    </div>
  );
}