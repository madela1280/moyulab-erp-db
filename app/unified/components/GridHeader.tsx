// app/unified/components/GridHeader.tsx

export default function GridHeader() {
  return (
    <div className="flex gap-2 px-4 py-2 bg-white">
      {[
        "unified","안내분류","분류","필터","검색","다운로드(엑셀)",
        "칼라","중복/오류검사","열 이동 모드","행 10 추가",
        "양식 추가(열)","선택 삭제"
      ].map((text) => (
        <button
          key={text}
          className="px-3 py-1 text-sm border rounded bg-gray-100 hover:bg-gray-200"
        >
          {text}
        </button>
      ))}
    </div>
  );
}
