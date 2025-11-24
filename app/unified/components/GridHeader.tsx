"use client";

export default function GridHeader() {
  return (
    <div className="w-full flex items-center gap-2 px-2 py-2 bg-white border-b">
      {/* 왼쪽 파란 "통합관리" 제목 */}
      <span className="text-blue-600 font-bold text-sm">통합관리</span>

      {/* 버튼 영역 */}
      <div className="flex items-center gap-2">
        <button className="text-xs px-2 py-1 bg-gray-100 border rounded">안내분류</button>
        <button className="text-xs px-2 py-1 bg-gray-100 border rounded">분류</button>
        <button className="text-xs px-2 py-1 bg-gray-100 border rounded">필터</button>
        <button className="text-xs px-2 py-1 bg-gray-100 border rounded">검색</button>
        <button className="text-xs px-2 py-1 bg-gray-100 border rounded">다운로드</button>
        <button className="text-xs px-2 py-1 bg-gray-100 border rounded">칼라</button>
        <button className="text-xs px-2 py-1 bg-gray-100 border rounded">중복</button>
        <button className="text-xs px-2 py-1 bg-gray-100 border rounded">오류검사</button>
        <button className="text-xs px-2 py-1 bg-gray-100 border rounded">열이동모드</button>
        <button className="text-xs px-2 py-1 bg-gray-100 border rounded">행10추가</button>
        <button className="text-xs px-2 py-1 bg-gray-100 border rounded">양식추가</button>
        <button className="text-xs px-2 py-1 bg-gray-100 border rounded">선택삭제</button>
      </div>
    </div>
  );
}

