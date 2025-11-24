// app/unified/components/GridTable.tsx

const COLUMNS = [
  '거래처분류','상태','안내분류','구매/렌탈','기기번호','기종','에러횟수','제품',
  '수취인명','연락처1','연락처2','계약자주소','택배발송일','시작일','종료일',
  '반납요청일','반납완료일','특이사항1','특이사항2','총연장횟수','신청일',
  '0차연장','1차연장','2차연장','3차연장','4차연장','5차연장',
];

export default function GridTable() {
  return (
    <div className="w-full h-full px-4">
      <div
        className="w-full h-full overflow-auto border rounded bg-white"
        style={{ minHeight: "500px" }}
      >
        <table className="min-w-[3200px] border-collapse table-fixed text-sm">
          <thead className="bg-gray-100 sticky top-0 z-10">
            <tr>
              {COLUMNS.map((c) => (
                <th key={c} className="border px-2 py-2 text-left whitespace-nowrap">
                  {c}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {/* 빈 행 10개 표시 (표 형태 확인용) */}
            {Array.from({ length: 10 }).map((_, r) => (
              <tr key={r}>
                {COLUMNS.map((c, i) => (
                  <td key={i} className="border px-2 py-2 h-[28px]"></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
