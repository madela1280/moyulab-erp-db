"use client";

export default function GridTable() {
  return (
    <div
      className="border rounded bg-white overflow-auto"
      style={{
        marginLeft: "0.3cm",
        marginRight: "0.3cm",
        maxHeight: "calc(100vh - 240px)",
      }}
    >
      <table className="min-w-[2800px] table-fixed border-collapse text-[70%]">
        <thead className="bg-gray-100 sticky top-0 z-10">
          <tr>
            <th className="border px-2 py-2">거래처분류</th>
            <th className="border px-2 py-2">상태</th>
            <th className="border px-2 py-2">안내분류</th>
            <th className="border px-2 py-2">구매/렌탈</th>
            <th className="border px-2 py-2">기기번호</th>
            <th className="border px-2 py-2">기종</th>
            <th className="border px-2 py-2">에러횟수</th>
            <th className="border px-2 py-2">제품</th>
            <th className="border px-2 py-2">수취인명</th>
            <th className="border px-2 py-2">연락처1</th>
            <th className="border px-2 py-2">연락처2</th>
            <th className="border px-2 py-2">계약자주소</th>
            <th className="border px-2 py-2">택배발송일</th>
            <th className="border px-2 py-2">시작일</th>
            <th className="border px-2 py-2">종료일</th>
            <th className="border px-2 py-2">반납요청일</th>
            <th className="border px-2 py-2">반납완료일</th>
            <th className="border px-2 py-2">특이사항1</th>
            <th className="border px-2 py-2">특이사항2</th>
            <th className="border px-2 py-2">총연장횟수</th>
            <th className="border px-2 py-2">신청일</th>
            <th className="border px-2 py-2">0차연장</th>
            <th className="border px-2 py-2">1차연장</th>
            <th className="border px-2 py-2">2차연장</th>
            <th className="border px-2 py-2">3차연장</th>
            <th className="border px-2 py-2">4차연장</th>
            <th className="border px-2 py-2">5차연장</th>
          </tr>
        </thead>

        <tbody>
          <tr>
            <td className="border px-2 py-2" contentEditable></td>
            <td className="border px-2 py-2" contentEditable></td>
            <td className="border px-2 py-2" contentEditable></td>
            <td className="border px-2 py-2" contentEditable></td>
            <td className="border px-2 py-2" contentEditable></td>
            <td className="border px-2 py-2" contentEditable></td>
            <td className="border px-2 py-2" contentEditable></td>
            <td className="border px-2 py-2" contentEditable></td>
            <td className="border px-2 py-2" contentEditable></td>
            <td className="border px-2 py-2" contentEditable></td>
            <td className="border px-2 py-2" contentEditable></td>
            <td className="border px-2 py-2" contentEditable></td>
            <td className="border px-2 py-2" contentEditable></td>
            <td className="border px-2 py-2" contentEditable></td>
            <td className="border px-2 py-2" contentEditable></td>
            <td className="border px-2 py-2" contentEditable></td>
            <td className="border px-2 py-2" contentEditable></td>
            <td className="border px-2 py-2" contentEditable></td>
            <td className="border px-2 py-2" contentEditable></td>
            <td className="border px-2 py-2" contentEditable></td>
            <td className="border px-2 py-2" contentEditable></td>
            <td className="border px-2 py-2" contentEditable></td>
            <td className="border px-2 py-2" contentEditable></td>
            <td className="border px-2 py-2" contentEditable></td>
            <td className="border px-2 py-2" contentEditable></td>
            <td className="border px-2 py-2" contentEditable></td>
            <td className="border px-2 py-2" contentEditable></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

