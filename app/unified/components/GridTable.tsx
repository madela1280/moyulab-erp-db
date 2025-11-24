// app/unified/components/GridTable.tsx
"use client";

export default function GridTable() {
  return (
    <div
      className="border rounded bg-white overflow-auto"
      style={{
        margin: "0.5cm",
        maxHeight: "calc(100vh - 240px)",
      }}
    >
      <table className="min-w-[2800px] table-fixed border-collapse text-sm">
        <thead className="bg-gray-100 sticky top-0 z-10">
          <tr>
            <th className="border px-2 py-1">거래처분류</th>
            <th className="border px-2 py-1">상태</th>
            <th className="border px-2 py-1">안내분류</th>
            <th className="border px-2 py-1">구매/렌탈</th>
            <th className="border px-2 py-1">기기번호</th>
            <th className="border px-2 py-1">기종</th>
            <th className="border px-2 py-1">에러횟수</th>
            <th className="border px-2 py-1">제품</th>
            <th className="border px-2 py-1">수취인명</th>
            <th className="border px-2 py-1">연락처1</th>
            <th className="border px-2 py-1">연락처2</th>
            <th className="border px-2 py-1">계약자주소</th>
            <th className="border px-2 py-1">택배발송일</th>
            <th className="border px-2 py-1">시작일</th>
            <th className="border px-2 py-1">종료일</th>
            <th className="border px-2 py-1">반납요청일</th>
            <th className="border px-2 py-1">반납완료일</th>
            <th className="border px-2 py-1">특이사항1</th>
            <th className="border px-2 py-1">특이사항2</th>
            <th className="border px-2 py-1">총연장횟수</th>
            <th className="border px-2 py-1">신청일</th>
            <th className="border px-2 py-1">0차연장</th>
            <th className="border px-2 py-1">1차연장</th>
            <th className="border px-2 py-1">2차연장</th>
            <th className="border px-2 py-1">3차연장</th>
            <th className="border px-2 py-1">4차연장</th>
            <th className="border px-2 py-1">5차연장</th>
          </tr>
        </thead>

        <tbody>
          <tr>
            {Array.from({ length: 27 }).map((_, idx) => (
              <td key={idx} className="border px-2 py-1"></td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
