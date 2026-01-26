import { NextResponse } from "next/server";
import { query } from "@/lib/db";

function getId(req: Request) {
  const url = new URL(req.url);
  return url.pathname.split("/").pop();
}

function normalizeString(v: any) {
  return String(v ?? "").trim();
}

function normalizeLower(v: any) {
  return normalizeString(v).toLowerCase();
}

// 기기관리 6개 테이블(소카테고리)
const DEVICE_TABLES = [
  "device_symphony",
  "device_lactina",
  "device_swing",
  "device_swing_maxi",
  "device_simile",
  "device_gaksimil",
] as const;

async function tableExists(tableName: string): Promise<boolean> {
  // 테이블이 없는 환경(마이그레이션/운영 차이)에서도 안전하게 동작
  const r = await query(`SELECT to_regclass($1) AS reg`, [`public.${tableName}`]);
  return !!r.rows?.[0]?.reg;
}

type DeviceInfo = {
  제품명: string | null;
  기종: string | null;
  구매렌탈: string | null;
  에러횟수: string | null;
};

async function findDeviceInfoBySystemNo(deviceNo: string): Promise<DeviceInfo | null> {
  const needle = normalizeLower(deviceNo);
  if (!needle) return null;

  for (const table of DEVICE_TABLES) {
    const exists = await tableExists(table);
    if (!exists) continue;

    // JSONB data에서 시스템 기기번호 매칭(대소문자 무시)
    const sql = `
      SELECT data
      FROM ${table}
      WHERE lower(COALESCE(data->>'시스템 기기번호','')) = $1::text
      LIMIT 1
    `;
    const r = await query(sql, [needle]);
    if (!r.rows?.length) continue;

    const data = (r.rows[0]?.data && typeof r.rows[0].data === "object") ? r.rows[0].data : {};

    const 제품명 = normalizeString((data as any)["제품명"]) || "";
    const 기종 = normalizeString((data as any)["기종"]) || "";
    const 구매렌탈 = normalizeString((data as any)["구매/렌탈"]) || "";

    // 심포니만 에러횟수 컬럼이 존재(다른 기기는 없을 수 있음)
    const 에러횟수Raw = (data as any)["에러횟수"];
    const 에러횟수 = normalizeString(에러횟수Raw);

    return {
      제품명: 제품명 ? 제품명 : null,
      기종: 기종 ? 기종 : null,
      구매렌탈: 구매렌탈 ? 구매렌탈 : null,
      에러횟수: 에러횟수 ? 에러횟수 : null,
    };
  }

  return null;
}

export async function GET(req: Request) {
  const id = getId(req);
  const r = await query(`SELECT id, data FROM unified WHERE id=$1`, [id]);

  if (!r.rows.length) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json(r.rows[0]);
}

export async function PATCH(req: Request) {
  const id = getId(req);
  const body = await req.json();

  // 기존 데이터 읽기
  const old = await query(`SELECT data FROM unified WHERE id=$1`, [id]);
  const source = old.rows[0]?.data || {};

  // ⭐ null 값도 정확하게 merge (삭제 반영)
  const merged: Record<string, any> = { ...source };
  for (const key in body) {
    merged[key] = (body as any)[key]; // body[key] === null → null 저장
  }

  // ✅ 기기번호가 "이번 PATCH에서 변경되었을 때"만 자동 매칭 반영
  // - 수기 입력/수정(syncPatch) 대응
  // - 붙여넣기/대량수정은 bulk-patch에서 별도로 처리 예정
  if (body && typeof body === "object" && Object.prototype.hasOwnProperty.call(body, "기기번호")) {
    const deviceNo = normalizeString(merged["기기번호"]);

    if (deviceNo) {
      const info = await findDeviceInfoBySystemNo(deviceNo);

      if (info) {
        // 통합관리 컬럼 키에 맞춰 저장
        merged["기종"] = info.기종;
        merged["구매/렌탈"] = info.구매렌탈;
        merged["에러횟수"] = info.에러횟수;
        merged["제품"] = info.제품명;
      } else {
        // 매칭 실패 시: 잘못된 잔상 방지(빈값 표시)
        merged["기종"] = null;
        merged["구매/렌탈"] = null;
        merged["에러횟수"] = null;
        merged["제품"] = null;
      }
    }
  }

  // 저장
  const r = await query(`UPDATE unified SET data=$1 WHERE id=$2 RETURNING id, data`, [merged, id]);

  return NextResponse.json(r.rows[0]);
}

export async function DELETE(req: Request) {
  const id = getId(req);

  await query(`DELETE FROM unified WHERE id=$1`, [id]);

  // 삭제 성공
  return NextResponse.json({ ok: true });
}





