"use client";

export default function GridHeader() {
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-gray-100 border-b">
      <span className="text-sm text-gray-700">안내분류</span>
      <span className="text-sm text-gray-700">분류</span>
      <span className="text-sm text-gray-700">필터</span>
      <span className="text-sm text-gray-700">검색</span>
      <span className="text-sm text-gray-700">다운로드</span>
      <span className="text-sm text-gray-700">칼라</span>
      <span className="text-sm text-gray-700">중복</span>
      <span className="text-sm text-gray-700">오류검사</span>
      <span className="text-sm text-gray-700">열이동모드</span>
      <span className="text-sm text-gray-700">행10추가</span>
      <span className="text-sm text-gray-700">양식추가</span>
      <span className="text-sm text-gray-700">선택삭제</span>
    </div>
  );
}
