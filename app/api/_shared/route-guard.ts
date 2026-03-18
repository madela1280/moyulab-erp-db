// app/api/_shared/route-guard.ts
import { NextResponse } from "next/server";

export type GuardOk<T> = { ok: true; data: T };
export type GuardFail = { ok: false; response: NextResponse };
export type GuardResult<T> = GuardOk<T> | GuardFail;

export function badRequest(error: string, detail?: string) {
  return NextResponse.json(
    { ok: false, error, ...(detail ? { detail } : {}) },
    { status: 400 }
  );
}

export function unauthorized(error = "unauthorized") {
  return NextResponse.json({ ok: false, error }, { status: 401 });
}

export function forbidden(error = "forbidden") {
  return NextResponse.json({ ok: false, error }, { status: 403 });
}

export function serverError(error = "server_error") {
  return NextResponse.json({ ok: false, error }, { status: 500 });
}

/**
 * req.json() 안전 파싱
 * - 빈 바디 / invalid json / non-object(body) 방어
 * - body가 object여야 하는 라우트에 공통 사용
 */
export async function parseJsonObjectBody(
  req: Request
): Promise<GuardResult<Record<string, any>>> {
  let body: any = null;

  try {
    body = await req.json();
  } catch {
    return {
      ok: false,
      response: badRequest("invalid_json", "Request body is not valid JSON"),
    };
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      response: badRequest("invalid_body", "JSON object body is required"),
    };
  }

  return { ok: true, data: body as Record<string, any> };
}

export function requireString(
  obj: Record<string, any>,
  key: string,
  opts?: { trim?: boolean; allowEmpty?: boolean }
): GuardResult<string> {
  const trim = opts?.trim ?? true;
  const allowEmpty = opts?.allowEmpty ?? false;

  const raw = obj[key];
  if (raw === undefined || raw === null) {
    return {
      ok: false,
      response: badRequest("invalid_params", `${key} is required`),
    };
  }

  let v = String(raw);
  if (trim) v = v.trim();

  if (!allowEmpty && v.length === 0) {
    return {
      ok: false,
      response: badRequest("invalid_params", `${key} must not be empty`),
    };
  }

  return { ok: true, data: v };
}

export function requireNumber(
  obj: Record<string, any>,
  key: string,
  opts?: { integer?: boolean; min?: number; max?: number }
): GuardResult<number> {
  const n = Number(obj[key]);

  if (!Number.isFinite(n)) {
    return {
      ok: false,
      response: badRequest("invalid_params", `${key} must be a number`),
    };
  }

  const value = opts?.integer ? Math.floor(n) : n;

  if (opts?.min != null && value < opts.min) {
    return {
      ok: false,
      response: badRequest("invalid_params", `${key} must be >= ${opts.min}`),
    };
  }

  if (opts?.max != null && value > opts.max) {
    return {
      ok: false,
      response: badRequest("invalid_params", `${key} must be <= ${opts.max}`),
    };
  }

  return { ok: true, data: value };
}

export function requireOneOf<T extends string>(
  value: any,
  allowed: readonly T[],
  fieldName: string
): GuardResult<T> {
  if (!allowed.includes(value as T)) {
    return {
      ok: false,
      response: badRequest(
        "invalid_params",
        `${fieldName} must be one of: ${allowed.join(", ")}`
      ),
    };
  }
  return { ok: true, data: value as T };
}