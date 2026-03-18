// app/api/_shared/db-error-map.ts
import { NextResponse } from "next/server";

type PgLikeError = {
  code?: string;
  detail?: string;
  message?: string;
  constraint?: string;
  table?: string;
};

function conflict(error: string, detail?: string) {
  return NextResponse.json(
    { ok: false, error, ...(detail ? { detail } : {}) },
    { status: 409 }
  );
}

function badRequest(error: string, detail?: string) {
  return NextResponse.json(
    { ok: false, error, ...(detail ? { detail } : {}) },
    { status: 400 }
  );
}

function notFound(error: string, detail?: string) {
  return NextResponse.json(
    { ok: false, error, ...(detail ? { detail } : {}) },
    { status: 404 }
  );
}

function serverError(error: string, detail?: string) {
  return NextResponse.json(
    { ok: false, error, ...(detail ? { detail } : {}) },
    { status: 500 }
  );
}

/**
 * 공통 DB 에러를 HTTP 응답으로 매핑
 * - 기본 정책:
 *   23505(unique violation) -> 409
 *   22P02(invalid text representation) -> 400
 *   42P01(undefined table) -> 500 (서버 설정/마이그레이션 이슈)
 *   23503(fk violation) -> 409
 *   42703(undefined column) -> 500
 */
export function mapDbErrorToResponse(
  e: unknown,
  opts?: {
    uniqueAsLockedByOther?: boolean; // locks acquire 충돌용
    uniqueErrorName?: string; // 기본: "duplicate_key"
    defaultErrorName?: string; // 기본: "server_error"
  }
): NextResponse {
  const err = (e ?? {}) as PgLikeError;
  const code = String(err.code ?? "");

  if (code === "23505") {
    if (opts?.uniqueAsLockedByOther) {
      return conflict(
        "locked_by_other",
        err.detail || "resource is already locked"
      );
    }
    return conflict(opts?.uniqueErrorName || "duplicate_key", err.detail);
  }

  if (code === "22P02") {
    return badRequest("invalid_params", err.message || err.detail);
  }

  if (code === "23503") {
    return conflict("foreign_key_violation", err.detail);
  }

  if (code === "42703") {
    return serverError("undefined_column", err.message || err.detail);
  }

  if (code === "42P01") {
    return serverError("undefined_table", err.message || err.detail);
  }

  if (code === "PGRST116") {
    return notFound("not_found", err.message || err.detail);
  }

  return serverError(opts?.defaultErrorName || "server_error", err.message || err.detail);
}