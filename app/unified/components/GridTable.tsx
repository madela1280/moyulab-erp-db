// app/unified/components/GridTable.tsx
"use client";

export default function GridTable() {
  return (
    <div
      className="border rounded bg-white overflow-auto"
      style={{
        marginLeft: "0.15cm",
        marginRight: "0.15cm",
        maxHeight: "calc(100vh - 240px)",
      }}
    >
      <table className="min-w-[2800px] table-fixed border-collapse text-[70%]">
        <thead className="bg-gray-100 sticky top-0 z-10">
          <tr>
            <th className="border px-2 py-1.5">거래처분류</th>
            <th className="border px-2 py-1.5">상태</th>
            <th className="border px-2 py-1.5">안내분류</th>
            <th className="border px-2 py-1.5">구매/렌탈</th>
            <th className="border px-2 py-1.5">기기번호</th>
            <th className="border px-2 py-1.5">기종</th>
            <th className="border px-2 py-1.5">에러횟수</th>
            <th className="border px-2 py-1.5">제품</th>
            <th className="border px-2 py-1.5">수취인명</th>
            <th className="border px-2 py-1.5">연락처1</th>
            <th className="border px-2 py-1.5">연락처2</th>
            <th className="border px-2 py-1.5">계약자주소</th>
            <th className="border px-2 py-1.5">택배발송일</th>
            <th className="border px-2 py-1.5">시작일</th>
            <th className="border px-2 py-1.5">종료일</th>
            <th className="border px-2 py-1.5">반납요청일</th>
            <th className="border px-2 py-1.5">반납완료일</th>
            <th className="border px-2 py-1.5">특이사항1</th>
            <th className="border px-2 py-1.5">특이사항2</th>
            <th className="border px-2 py-1.5">총연장횟수</th>
            <th className="border px-2 py-1.5">신청일</th>
            <th className="border px-2 py-1.5">0차연장</th>
            <th className="border px-2 py-1.5">1차연장</th>
            <th className="border px-2 py-1.5">2차연장</th>
            <th className="border px-2 py-1.5">3차연장</th>
            <th className="border px-2 py-1.5">4차연장</th>
            <th className="border px-2 py-1.5">5차연장</th>
          </tr>
        </thead>

        <tbody>
          <tr>
            {Array.from({ length: 27 }).map((_, i) => (
              <td key={i} className="border px-2 py-1.5" contentEditable></td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}


