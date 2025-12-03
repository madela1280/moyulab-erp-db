// app/global-lock/lock-engine.ts
"use client";

export type LockInfo = {
  resource_type: string;
  resource_id: number;
  locked_by_username: string;
  locked_by_name: string;
  locked_at: string;
  expires_at: string;
};

export type LockAcquireResult =
  | { ok: true; lock: LockInfo }
  | { ok: false; reason: "locked_by_other"; lock: LockInfo }
  | { ok: false; reason: "unauthorized" | "invalid_params" | "server_error" };

async function postLock(body: any) {
  const res = await fetch("/api/locks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { res, data };
}

/** 행 편집 시작 전에 호출: 락 요청 */
export async function acquireLock(
  resourceType: string,
  resourceId: number
): Promise<LockAcquireResult> {
  const { res, data } = await postLock({
    action: "acquire",
    resource_type: resourceType,
    resource_id: resourceId,
  });

  if (!data || !res.ok) {
    if (data?.error === "unauthorized") {
      return { ok: false, reason: "unauthorized" };
    }
    return { ok: false, reason: "server_error" };
  }

  if (data.ok && data.lock) {
    return { ok: true, lock: data.lock as LockInfo };
  }

  if (data.ok === false && data.reason === "locked_by_other" && data.lock) {
    return {
      ok: false,
      reason: "locked_by_other",
      lock: data.lock as LockInfo,
    };
  }

  return { ok: false, reason: "server_error" };
}

/** 편집 끝났을 때 호출: 락 해제 */
export async function releaseLock(
  resourceType: string,
  resourceId: number
): Promise<boolean> {
  const { res } = await postLock({
    action: "release",
    resource_type: resourceType,
    resource_id: resourceId,
  });
  return res.ok;
}

/** 필요할 때 락 상태만 확인 */
export async function getLockStatus(
  resourceType: string,
  resourceId: number
): Promise<
  | { ok: true; locked: false }
  | { ok: true; locked: true; lock: LockInfo }
  | { ok: false }
> {
  const { res, data } = await postLock({
    action: "status",
    resource_type: resourceType,
    resource_id: resourceId,
  });

  if (!res.ok || !data) return { ok: false };

  if (data.ok && data.locked === false) {
    return { ok: true, locked: false };
  }

  if (data.ok && data.locked === true && data.lock) {
    return { ok: true, locked: true, lock: data.lock as LockInfo };
  }

  return { ok: false };
}