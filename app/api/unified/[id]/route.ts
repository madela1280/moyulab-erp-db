// app/api/unified/[id]/route.ts

import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { computeZeroExtensionDaysFromDates } from "@/views/unified/extensions/extensionCompute";
import { isGuideMigrationLocked } from "@/unified/migration-mode/guideMigrationLock";
import {
  buildUnifiedCellChangeItems,
  buildUnifiedDeleteChangeItems,
  getChangeHistoryActor,
  recordUnifiedChangeHistory,
} from "@/unified/change-history/serverChangeHistory";

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

async function mergeUnifiedJsonbById(id: string, patch: Record<string, any>) {
  // ✅ 핵심: SELECT→통째 UPDATE가 아니라, DB에서 jsonb merge(원자적)로 반영
  //    data = data || patch  (patch의 null은 null로 저장됨)
  const r = await query(
    `
    UPDATE unified
    SET data = COALESCE(data, '{}'::jsonb) || $1::jsonb
    WHERE id = $2
    RETURNING id, data
    `,
    [JSON.stringify(patch ?? {}), id]
  );

  return r.rows?.[0] ?? null;
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

  // 존재 확인(404 유지) + 초기이관 고정 여부 판정용 기존 data 조회
  const exists = await query(`SELECT data FROM unified WHERE id=$1`, [id]);
  if (!exists.rows?.length) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const existingData =
    exists.rows[0]?.data && typeof exists.rows[0].data === "object"
      ? (exists.rows[0].data as Record<string, any>)
      : {};

  // ✅ body가 객체가 아니면 거부
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  // ✅ patch 정리: null도 그대로 저장(삭제 반영)
  // ✅ "상태" 컬럼은 파생 표시용이므로, 서버 저장 대상에서 제외(무시)
  const patch: Record<string, any> = {};
  for (const key in body) {
    if (key === "상태") continue; // ✅ 상태 저장 차단
    patch[key] = (body as any)[key]; // null 포함
  }

  // ✅ 거래처분류가 "이번 PATCH에서 변경되었을 때" 안내분류 자동 세팅
  // - 매핑이 없으면 안내분류는 비움(null)
  // - 단, 초기이관모드로 안내분류가 고정된 행은 자동매핑으로 안내분류를 덮어쓰지 않음
  if (Object.prototype.hasOwnProperty.call(body, "거래처분류")) {
    const lockedByExistingRow = isGuideMigrationLocked(existingData);
    const lockedByPatch = isGuideMigrationLocked(patch);

    if (!lockedByExistingRow && !lockedByPatch) {
      const partnerName = normalizeString(patch["거래처분류"]);
      if (!partnerName) {
        patch["안내분류"] = null;
      } else {
        const guide = await findGuideByPartnerName(partnerName);
        patch["안내분류"] = guide ? guide : null;
      }
    }
  }

  // ✅ 기기번호가 "이번 PATCH에서 변경되었을 때"만 자동 매칭 반영
  if (Object.prototype.hasOwnProperty.call(body, "기기번호")) {
    const deviceNo = normalizeString(patch["기기번호"]);

    if (deviceNo) {
      const info = await findDeviceInfoBySystemNo(deviceNo);

      if (info) {
        patch["기종"] = info.기종;
        patch["구매/렌탈"] = info.구매렌탈;
        patch["에러횟수"] = info.에러횟수;
        patch["제품"] = info.제품명;
      } else {
        // 매칭 실패 시: 잘못된 잔상 방지(빈값 표시)
        patch["기종"] = null;
        patch["구매/렌탈"] = null;
        patch["에러횟수"] = null;
        patch["제품"] = null;
      }
    }
  }

   // 1) 우선 jsonb merge로 저장(동시 PATCH 덮어쓰기 방지)
  let saved = await mergeUnifiedJsonbById(String(id), patch);
  if (!saved) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  // 2) ✅ 0차연장 규칙(최초 1회 기록):
  // - body에 "0차연장"이 직접 들어온 경우(업로드/수기입력)는 그대로 저장(자동계산 없음)
  // - "시작일" 또는 "종료일"이 이번 PATCH에서 변경되었고,
  //   현재 DB의 0차연장이 비어있다면(=null/"") 종료일-시작일을 계산하여 1회만 기록
  // - ✅ 동시 요청 안전: "0차연장"이 비어 있을 때만 조건부 UPDATE
  const shouldAutoZeroExtension =
    !Object.prototype.hasOwnProperty.call(body, "0차연장") &&
    (Object.prototype.hasOwnProperty.call(body, "시작일") ||
      Object.prototype.hasOwnProperty.call(body, "종료일"));

  if (shouldAutoZeroExtension) {
    const current = saved?.data && typeof saved.data === "object" ? (saved.data as any) : {};
    const zeroRaw = normalizeString(current?.["0차연장"]);
    const startRaw = normalizeString(current?.["시작일"]);
    const endRaw = normalizeString(current?.["종료일"]);

    if (!zeroRaw) {
      const computed = computeZeroExtensionDaysFromDates(startRaw, endRaw);
      if (computed != null) {
        // ✅ 0차연장이 "여전히 비어 있을 때만" 기록 (동시성 안전)
        const r2 = await query(
          `
          UPDATE unified
          SET data = COALESCE(data, '{}'::jsonb) || $1::jsonb
          WHERE id = $2
            AND COALESCE(data->>'0차연장','') = ''
          RETURNING id, data
          `,
          [JSON.stringify({ "0차연장": computed }), id]
        );

        if (r2.rows?.[0]) {
          saved = r2.rows[0];
        }
      }
    }
  }

  // 3) ✅ 변경이력 기록
  // - 기존 저장 흐름은 그대로 유지
  // - 이력 기록 실패가 통합관리 저장 실패로 번지지 않도록 catch 처리
  // - 실제 변경된 컬럼만 item으로 저장
  try {
    const finalData =
      saved?.data && typeof saved.data === "object" && !Array.isArray(saved.data)
        ? (saved.data as Record<string, any>)
        : {};

    const historyColumnKeys = Array.from(
      new Set(
        Object.keys(patch || {})
          .map((key) => String(key ?? "").trim())
          .filter(Boolean)
      )
    );

    const beforeZero = normalizeString(existingData?.["0차연장"]);
    const afterZero = normalizeString(finalData?.["0차연장"]);
    if (beforeZero !== afterZero && !historyColumnKeys.includes("0차연장")) {
      historyColumnKeys.push("0차연장");
    }

    const items = buildUnifiedCellChangeItems({
      unifiedId: Number(id),
      beforeData: existingData,
      afterData: finalData,
      columnKeys: historyColumnKeys,
      actionType: "cell_update",
    });

    if (items.length) {
      const actor = await getChangeHistoryActor();

      await recordUnifiedChangeHistory({
        action_type: "cell_update",
        changed_by_username: actor.username,
        changed_by_name: actor.name,
        description: `통합관리 단건 수정 row ${id}`,
        items,
      });
    }
  } catch (err) {
    console.warn("unified change history record failed (ignored):", err);
  }

  return NextResponse.json(saved); 
}

export async function DELETE(req: Request) {
  const id = getId(req);

  // ✅ unified 삭제 시 unified_order도 함께 정리(카운트/페이징/유령 데이터 방지)
  // - 기존 응답 형태({ ok:true })는 유지
  // - 변경이력 기록을 위해 삭제된 unified row의 id/data를 RETURNING
  const r = await query(
    `
    WITH del_order AS (
      DELETE FROM unified_order
      WHERE unified_id = $1
      RETURNING unified_id
    ),
    del_unified AS (
      DELETE FROM unified
      WHERE id = $1
      RETURNING id, data
    )
    SELECT
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'id', id,
              'data', data
            )
          )
          FROM del_unified
        ),
        '[]'::json
      ) AS deleted_rows
    `,
    [id]
  );

  // ✅ 변경이력 기록
  // - 삭제 전 row data를 before_row_data로 저장
  // - 이력 기록 실패가 삭제 성공 응답에 영향 주지 않도록 catch 처리
  try {
    const rawRows = r.rows?.[0]?.deleted_rows;

    let deletedRows: Array<{ id: number; data: any }> = [];

    if (Array.isArray(rawRows)) {
      deletedRows = rawRows
        .map((x: any) => ({
          id: Number(x?.id),
          data: x?.data,
        }))
        .filter((x: any) => Number.isFinite(x.id) && x.id > 0);
    } else if (typeof rawRows === "string") {
      try {
        const arr = JSON.parse(rawRows);
        if (Array.isArray(arr)) {
          deletedRows = arr
            .map((x: any) => ({
              id: Number(x?.id),
              data: x?.data,
            }))
            .filter((x: any) => Number.isFinite(x.id) && x.id > 0);
        }
      } catch {
        deletedRows = [];
      }
    }

    const items = buildUnifiedDeleteChangeItems(deletedRows);

    if (items.length) {
      const actor = await getChangeHistoryActor();

      await recordUnifiedChangeHistory({
        action_type: "bulk_delete",
        changed_by_username: actor.username,
        changed_by_name: actor.name,
        description: `통합관리 단건 삭제 row ${id}`,
        items,
      });
    }
  } catch (err) {
    console.warn("unified delete change history record failed (ignored):", err);
  }

  // 삭제 성공
  return NextResponse.json({ ok: true });
}