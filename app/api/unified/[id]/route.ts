// C:\Users\USER\Desktop\moyulab-erp-db\app\api\unified\[id]\route.ts

import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { computeZeroExtensionDaysFromDates } from "@/views/unified/extensions/extensionCompute";

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

// ✅ 거래처분류 → 안내분류 매핑 조회
async function findGuideByPartnerName(partnerName: string): Promise<string | null> {
  const p = normalizeString(partnerName);
  if (!p) return null;

  const r = await query(
    `SELECT guide_name
     FROM partner_guide_map
     WHERE partner_name=$1
     LIMIT 1`,
    [p]
  );

  const g = normalizeString(r.rows?.[0]?.guide_name);
  return g ? g : null;
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

type DeviceInfo = {
  제품명: string | null;
  기종: string | null;
  구매렌탈: string | null;
  에러횟수: string | null;
};

// ✅ 존재하는 테이블만 1회에 확인(6번 왕복 방지) + 프로세스 캐시
async function getExistingDeviceTables(): Promise<string[]> {
  const cached = (globalThis as any).__existingDeviceTables;
  if (Array.isArray(cached) && cached.length >= 0) return cached;

  const names = Array.from(DEVICE_TABLES);
  const r = await query(
    `
    SELECT
      t.name,
      to_regclass('public.' || t.name) AS reg
    FROM unnest($1::text[]) AS t(name)
    `,
    [names]
  );

  const exists = (r.rows || [])
    .filter((x: any) => !!x?.reg)
    .map((x: any) => String(x.name))
    .filter(Boolean);

  (globalThis as any).__existingDeviceTables = exists;
  return exists;
}

// ✅ 6개 테이블 순차 조회 대신: UNION ALL 1번 조회(왕복/지연 감소)
async function findDeviceInfoBySystemNo(deviceNo: string): Promise<DeviceInfo | null> {
  const needle = normalizeLower(deviceNo);
  if (!needle) return null;

  const tables = await getExistingDeviceTables();
  if (!tables.length) return null;

  // 우선순위는 DEVICE_TABLES(=tables 배열 순서) 그대로 유지
  const parts: string[] = [];
  for (let i = 0; i < tables.length; i++) {
    const t = tables[i];
    parts.push(`
      SELECT data, ${i + 1} AS pri
      FROM ${t}
      WHERE lower(COALESCE(data->>'시스템 기기번호','')) = $1::text
    `);
  }

  const sql = `
    SELECT data
    FROM (
      ${parts.join(" UNION ALL ")}
    ) x
    ORDER BY x.pri ASC
    LIMIT 1
  `;

  const r = await query(sql, [needle]);
  if (!r.rows?.length) return null;

  const data = r.rows[0]?.data && typeof r.rows[0].data === "object" ? r.rows[0].data : {};

  const 제품명 = normalizeString((data as any)["제품명"]) || "";
  const 기종 = normalizeString((data as any)["기종"]) || "";
  const 구매렌탈 = normalizeString((data as any)["구매/렌탈"]) || "";
  const 에러횟수 = normalizeString((data as any)["에러횟수"]);

  return {
    제품명: 제품명 ? 제품명 : null,
    기종: 기종 ? 기종 : null,
    구매렌탈: 구매렌탈 ? 구매렌탈 : null,
    에러횟수: 에러횟수 ? 에러횟수 : null,
  };
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
  // ✅ "상태" 컬럼은 파생 표시용이므로, 서버 저장 대상에서 제외(무시)
  const merged: Record<string, any> = { ...source };
  for (const key in body) {
    if (key === "상태") continue; // ✅ 상태 저장 차단
    merged[key] = (body as any)[key]; // body[key] === null → null 저장
  }

  // ✅ 0차연장 규칙(최초 1회 기록):
  // - body에 "0차연장"이 직접 들어온 경우(업로드/수기입력)는 그대로 저장(자동계산 없음)
  // - "시작일" 또는 "종료일"이 이번 PATCH에서 변경되었고,
  //   현재 DB의 0차연장이 비어있다면(=null/""), 종료일-시작일을 계산하여 1회만 기록
  if (
    body &&
    typeof body === "object" &&
    !Object.prototype.hasOwnProperty.call(body, "0차연장") &&
    (Object.prototype.hasOwnProperty.call(body, "시작일") || Object.prototype.hasOwnProperty.call(body, "종료일"))
  ) {
    const zeroRaw = normalizeString(merged["0차연장"]);
    const startRaw = normalizeString(merged["시작일"]);
    const endRaw = normalizeString(merged["종료일"]);

    if (!zeroRaw) {
      const computed = computeZeroExtensionDaysFromDates(startRaw, endRaw);
      if (computed != null) {
        merged["0차연장"] = computed;
      }
    }
  }

  // ✅ 거래처분류가 "이번 PATCH에서 변경되었을 때" 안내분류 자동 세팅
  // - 매핑이 없으면 안내분류는 비움(null)
  if (body && typeof body === "object" && Object.prototype.hasOwnProperty.call(body, "거래처분류")) {
    const partnerName = normalizeString(merged["거래처분류"]);
    if (!partnerName) {
      merged["안내분류"] = null;
    } else {
      const guide = await findGuideByPartnerName(partnerName);
      merged["안내분류"] = guide ? guide : null;
    }
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