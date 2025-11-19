import { NextResponse } from "next/server";
import { query } from "@/lib/db";

const COLUMNS = [
  "거래처분류","상태","안내분류","구매_렌탈","기기번호","기종","에러횟수","제품",
  "수취인명","연락처1","연락처2","계약자주소","택배발송일","시작일","종료일",
  "반납요청일","반납완료일","특이사항1","특이사항2","총연장횟수","신청일",
  "0차연장","1차연장","2차연장","3차연장","4차연장","5차연장"
];

export async function GET() {
  const r = await query(`SELECT * FROM unified ORDER BY id ASC`);
  return NextResponse.json(r.rows);
}

export async function POST(req: Request) {
  const body = await req.json();
  const cols = COLUMNS;
  const vals = cols.map(c => body[c] ?? "");
  const params = vals.map((_, i) => `$${i + 1}`).join(",");

  const r = await query(
    `INSERT INTO unified (${cols.map(c => `"${c}"`).join(",")})
     VALUES (${params})
     RETURNING *`,
    vals
  );
  return NextResponse.json(r.rows[0]);
}






