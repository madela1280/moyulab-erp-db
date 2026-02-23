"use client";

import type { RecoveryScope } from "@/recoveryComplete/components/RecoveryMain";

export type RecoveryRow = {
  id: number;
  data: Record<string, any>;
  sort_key?: number;
};

export type RecoveryListResponse = {
  rows: RecoveryRow[];
  total: number;
  baseIndex: number;
};

function basePath(scope: RecoveryScope) {
  return scope === "recovery1" ? "/api/recovery1" : "/api/recovery2";
}

function qs(params: Record<string, string | number | null | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined) continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export async function fetchRecoveryCount(scope: RecoveryScope) {
  const r = await fetch(`${basePath(scope)}?meta=count`, { cache: "no-store" });
  if (!r.ok) throw new Error(`FAILED(${r.status})`);
  const j = (await r.json().catch(() => null)) as any;
  return Number(j?.count ?? 0);
}

export async function fetchRecoveryByIds(scope: RecoveryScope, ids: number[]) {
  const clean = (ids || [])
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((n) => Math.floor(n));

  if (!clean.length) return [] as RecoveryRow[];

  const r = await fetch(
    `${basePath(scope)}${qs({ ids: clean.join(",") })}`,
    { cache: "no-store" }
  );
  if (!r.ok) throw new Error(`FAILED(${r.status})`);
  return (await r.json()) as RecoveryRow[];
}

export async function fetchRecoveryTailData(scope: RecoveryScope, limit = 500) {
  const r = await fetch(
    `${basePath(scope)}${qs({ tailData: 1, limit })}`,
    { cache: "no-store" }
  );
  if (!r.ok) throw new Error(`FAILED(${r.status})`);
  const j = (await r.json()) as RecoveryListResponse;
  return j;
}

export async function fetchRecoveryPrevPage(args: {
  scope: RecoveryScope;
  beforeSortKey: number;
  beforeId: number;
  limit?: number;
}) {
  const { scope, beforeSortKey, beforeId, limit = 500 } = args;

  const r = await fetch(
    `${basePath(scope)}${qs({ beforeSortKey, beforeId, limit })}`,
    { cache: "no-store" }
  );
  if (!r.ok) throw new Error(`FAILED(${r.status})`);
  const j = (await r.json()) as RecoveryListResponse;
  return j;
}

export async function fetchRecoveryNextPage(args: {
  scope: RecoveryScope;
  afterSortKey: number;
  afterId: number;
  limit?: number;
}) {
  const { scope, afterSortKey, afterId, limit = 500 } = args;

  const r = await fetch(
    `${basePath(scope)}${qs({ afterSortKey, afterId, limit })}`,
    { cache: "no-store" }
  );
  if (!r.ok) throw new Error(`FAILED(${r.status})`);
  const j = (await r.json()) as RecoveryListResponse;
  return j;
}

export async function insertRecoveryRows(args: {
  scope: RecoveryScope;
  count: number;
  beforeId: number | null;
  afterId: number | null;
}) {
  const { scope, ...body } = args;

  const r = await fetch(`${basePath(scope)}/insert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `FAILED(${r.status})`);
  }

  return (await r.json().catch(() => ({}))) as {
    ok: boolean;
    insertedCount?: number;
    insertedIds?: number[];
    insertedRows?: Array<{ id: number; sort_key: number }>;
  };
}

export async function bulkPatchRecoveryRows(args: {
  scope: RecoveryScope;
  updates: Array<{ id: number; patch: Record<string, any> }>;
}) {
  const { scope, updates } = args;

  const r = await fetch(`${basePath(scope)}/bulk-patch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ updates }),
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `FAILED(${r.status})`);
  }

  return (await r.json().catch(() => ({}))) as {
    ok: boolean;
    updatedCount?: number;
    rows?: RecoveryRow[];
  };
}

export async function bulkDeleteRecoveryRows(args: {
  scope: RecoveryScope;
  ids: number[];
}) {
  const { scope, ids } = args;

  const r = await fetch(`${basePath(scope)}/bulk-delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `FAILED(${r.status})`);
  }

  return (await r.json().catch(() => ({}))) as {
    ok: boolean;
    deletedCount?: number;
    deletedIds?: number[];
  };
}