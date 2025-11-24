// app/unified/components/GridHeader.tsx

"use client";

import React from "react";

interface Props {
  onClick?: () => void;
}

export default function GridHeader({}: Props) {
  return (
    <div className="w-full flex items-center gap-2 px-4 py-2 bg-white border-b">

      <button className="px-3 py-1 border rounded bg-gray-50">안내분류</button>
      <button className="px-3 py-1 border rounded bg-gray-50">분류</button>
      <button className="px-3 py-1 border rounded bg-gray-50">필터</button>
      <button className="px-3 py-1 border rounded bg-gray-50">검색</button>
      <button className="px-3 py-1 border rounded bg-gray-50">다운로드(엑셀)</button>
      <button className="px-3 py-1 border rounded bg-gray-50">칼라</button>
      <button className="px-3 py-1 border rounded bg-gray-50">중복/오류검사</button>

      <div className="flex-1"></div>

      <button className="px-3 py-1 border rounded bg-gray-50">열 이동 모드</button>
      <button className="px-3 py-1 border rounded bg-gray-50">행 10 추가</button>
      <button className="px-3 py-1 border rounded bg-gray-50">양식 추가(열)</button>
      <button className="px-3 py-1 border rounded bg-gray-50">선택 삭제</button>

    </div>
  );
}
