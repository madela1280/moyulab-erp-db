"use client";

// 소켓 클라이언트 연결 보장(코어 수정 없이 import만)
import "@/global-socket/socket-client";

import { useEffect, useMemo, useRef, useState } from "react";
import UnifiedColumnPickerModal from "@/views/dataUpload/components/UnifiedColumnPickerModal";
import SignupGrid from "@/views/dataUpload/components/SignupGrid";
import SignupTransferErrorModal from "@/views/dataUpload/signup-transfer/SignupTransferErrorModal";
import { useSignupDraft } from "@/views/dataUpload/signup-draft/useSignupDraft";
import { syncEmitUnifiedUpdate, syncListen } from "@/global-sync/sync-engine";

type UnifiedColumnsResponse = {
  order: string[];
  custom?: Array<{ key: string; created_by?: string | null; created_at?: string | null }>;
};

type SignupSettings = {
  selectedKeys: string[];
  colWidthSteps: Record<string, number>;
  rowCount: number;
  partnerOptions: string[];
};

const DEFAULT_SETTINGS: SignupSettings = {
  selectedKeys: [],
  colWidthSteps: {},
  rowCount: 1,
  partnerOptions: [],
};

function toUserMessage(raw: string) {
  const m = String(raw || "");
  if (!m) return "";

  if (m.includes("relation") && m.includes("does not exist")) return "설정 정보를 불러오지 못했습니다.";
  if (m.includes("SIGNUP_SETTINGS_")) return "설정 정보를 불러오지 못했습니다.";
  if (m.includes("FAILED(")) return "요청 처리에 실패했습니다.";

  return m;
}

function isPlainObject(v: any) {
  return v && typeof v === "object" && !Array.isArray(v);
}

export default function SignupView() {
  const [allColumns, setAllColumns] = useState<string[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [loadingColumns, setLoadingColumns] = useState(false);
  const [error, setError] = useState<string>("");

  // 전송 실패 모달
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferErrorMessage, setTransferErrorMessage] = useState("");
  // 강제전송 트리거(토큰) - SignupGrid에서 이 토큰을 받아 force 전송 실행
  const [forceSubmitToken, setForceSubmitToken] = useState(0);

  // settings (DB/API 기반)
  const [colWidthSteps, setColWidthSteps] = useState<Record<string, number>>(DEFAULT_SETTINGS.colWidthSteps);
  const [rowCount, setRowCount] = useState<number>(DEFAULT_SETTINGS.rowCount);
  const [partnerOptions, setPartnerOptions] = useState<string[]>(DEFAULT_SETTINGS.partnerOptions);

  // ✅ 최신값 ref (언마운트 flush에서 stale closure 방지)
  const latestSelectedKeysRef = useRef<string[]>([]);
  const latestColWidthStepsRef = useRef<Record<string, number>>({});
  const latestRowCountRef = useRef<number>(DEFAULT_SETTINGS.rowCount);
  const latestPartnerOptionsRef = useRef<string[]>([]);

  useEffect(() => {
    latestSelectedKeysRef.current = Array.isArray(selectedKeys) ? selectedKeys : [];
  }, [selectedKeys]);
  useEffect(() => {
    latestColWidthStepsRef.current = colWidthSteps && typeof colWidthSteps === "object" ? colWidthSteps : {};
  }, [colWidthSteps]);
  useEffect(() => {
    latestRowCountRef.current = Number.isFinite(Number(rowCount)) ? Number(rowCount) : DEFAULT_SETTINGS.rowCount;
  }, [rowCount]);
  useEffect(() => {
    latestPartnerOptionsRef.current = Array.isArray(partnerOptions) ? partnerOptions : [];
  }, [partnerOptions]);

  // settings hydrate / patch queue
  const settingsHydratedRef = useRef(false);
  const patchTimerRef = useRef<number | null>(null);

  // ✅ pendingPatchRef는 "진짜 저장 대기중인 것만" 유지
  // - selectedKeys는 즉시 저장이 기본이며, 즉시 저장 실패한 경우에만 pending에 쌓음
  const pendingPatchRef = useRef<Partial<SignupSettings>>({});

  // unified.update 수신 시 reload 폭주 방지(점멸 방지)
  const reloadTimerRef = useRef<number | null>(null);
  const settingsReloadTimerRef = useRef<number | null>(null);

  // 다른 탭 수정 내용을 Grid에 "강제 적용"하기 위한 토큰
  const [rowsReloadToken, setRowsReloadToken] = useState(0);

  // ✅ settings 변경 시 unified:update emit 스로틀(다른 탭에 실시간 반영)
  const lastEmitAtRef = useRef(0);
  const emitTimerRef = useRef<number | null>(null);
  const EMIT_THROTTLE_MS = 1200;

  function emitUnifiedUpdateThrottled() {
    if (typeof window === "undefined") return;

    const now = Date.now();
    const elapsed = now - lastEmitAtRef.current;

    if (elapsed >= EMIT_THROTTLE_MS) {
      lastEmitAtRef.current = now;
      syncEmitUnifiedUpdate();
      return;
    }

    if (emitTimerRef.current) return;

    const wait = Math.max(50, EMIT_THROTTLE_MS - elapsed);
    emitTimerRef.current = window.setTimeout(() => {
      emitTimerRef.current = null;
      lastEmitAtRef.current = Date.now();
      syncEmitUnifiedUpdate();
    }, wait);
  }

  const draft = useSignupDraft({
    onError: (msg) => setError(toUserMessage(msg)),
  });

  async function loadColumns() {
    setLoadingColumns(true);
    setError("");
    try {
      const r = await fetch("/api/unified-columns", { cache: "no-store" });
      if (!r.ok) throw new Error(`FAILED(${r.status})`);
      const j = (await r.json()) as UnifiedColumnsResponse;
      const order = Array.isArray(j?.order) ? j.order.map(String) : [];
      setAllColumns(order);
    } catch (e: any) {
      setError(toUserMessage(e?.message) || "컬럼 목록을 불러오지 못했습니다.");
    } finally {
      setLoadingColumns(false);
    }
  }

  function normalizeSettings(j: any): SignupSettings {
    const nextSelectedKeys = Array.isArray(j?.selectedKeys) ? j.selectedKeys.map(String) : DEFAULT_SETTINGS.selectedKeys;
    const nextColWidthSteps =
      isPlainObject(j?.colWidthSteps) ? (j.colWidthSteps as Record<string, number>) : DEFAULT_SETTINGS.colWidthSteps;
    const nextRowCount = Number.isFinite(Number(j?.rowCount))
      ? Math.max(1, Math.floor(Number(j?.rowCount)))
      : DEFAULT_SETTINGS.rowCount;
    const nextPartnerOptions = Array.isArray(j?.partnerOptions)
      ? j.partnerOptions.map(String)
      : DEFAULT_SETTINGS.partnerOptions;

    return {
      selectedKeys: nextSelectedKeys,
      colWidthSteps: nextColWidthSteps,
      rowCount: nextRowCount,
      partnerOptions: nextPartnerOptions,
    };
  }

  async function patchSettingsNow(body: Partial<SignupSettings>, keepalive: boolean) {
    const r = await fetch("/api/signup-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive,
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(t || `FAILED(${r.status})`);
    }
    return (await r.json()) as SignupSettings;
  }

  // ✅ selectedKeys는 즉시 저장(카테고리 이동/언마운트 타이밍에서 "빈값 덮어쓰기" 방지)
  async function saveSelectedKeysImmediately(next: string[]) {
    try {
      const saved = await patchSettingsNow({ selectedKeys: next }, false);

      const safe = Array.isArray(saved?.selectedKeys) ? saved.selectedKeys : next;
      setSelectedKeys(safe);

      // pending에서 selectedKeys 제거(덮어쓰기/중복 저장 방지)
      const p = pendingPatchRef.current || {};
      if ("selectedKeys" in p) {
        const { selectedKeys: _drop, ...rest } = p as any;
        pendingPatchRef.current = rest;
      }

      emitUnifiedUpdateThrottled();
    } catch {
      setError("양식 저장에 실패했습니다.(selectedKeys)");
      // 실패 시에만 pending에 쌓음
      pendingPatchRef.current = { ...pendingPatchRef.current, selectedKeys: next };
    }
  }

  // ✅ rowCount는 저장 성공 직후 "즉시 저장"이 필요(바로 나갈 때 1로 덮어쓰이는 레이스 방지)
  async function saveRowCountImmediately(nextCount: number) {
    const count = Math.max(1, Math.floor(Number(nextCount)));
    try {
      const saved = await patchSettingsNow({ rowCount: count }, false);

      const safeRowCount = Number.isFinite(Number(saved?.rowCount)) ? Math.max(1, Math.floor(Number(saved.rowCount))) : count;
      setRowCount(safeRowCount);

      // ✅ 언마운트 flush가 stale로 덮어쓰지 않게 ref 즉시 동기화
      latestRowCountRef.current = safeRowCount;

      // pending에서 rowCount 제거(중복 저장/덮어쓰기 방지)
      const p = pendingPatchRef.current || {};
      if ("rowCount" in p) {
        const { rowCount: _drop, ...rest } = p as any;
        pendingPatchRef.current = rest;
      }

      emitUnifiedUpdateThrottled();
    } catch {
      // 실패하면 pending에만 누적(유실 방지)
      pendingPatchRef.current = { ...pendingPatchRef.current, rowCount: count };
      setError("설정 저장에 실패했습니다.(rowCount)");
    }
  }

  function queuePatch(partial: Partial<SignupSettings>) {
    // ✅ selectedKeys는 여기서 절대 저장하지 않음(즉시 저장만)
    const { selectedKeys: _ignore, ...rest } = partial as any;
    pendingPatchRef.current = { ...pendingPatchRef.current, ...rest };

    if (!settingsHydratedRef.current) return;

    if (patchTimerRef.current) window.clearTimeout(patchTimerRef.current);
    patchTimerRef.current = window.setTimeout(async () => {
      const body = pendingPatchRef.current;
      pendingPatchRef.current = {};

      try {
        await patchSettingsNow(body, false);
        emitUnifiedUpdateThrottled();
      } catch {
        setError("설정 저장에 실패했습니다.");
        // 실패 시 다시 누적(유실 방지)
        pendingPatchRef.current = { ...body, ...pendingPatchRef.current };
      }
    }, 250);
  }

  async function loadSettings() {
    try {
      const r = await fetch("/api/signup-settings", { cache: "no-store" });

      // GET 실패여도 hydrate true로 전환(이후 저장 큐가 동작하도록)
      if (!r.ok) {
        const wasHydrated = settingsHydratedRef.current;
        settingsHydratedRef.current = true;

        // hydrate 직후 pending이 있으면 flush
        if (!wasHydrated && Object.keys(pendingPatchRef.current || {}).length > 0) {
          queuePatch({});
        }
        return;
      }

      const j = (await r.json()) as Partial<SignupSettings> | null;
      const server = normalizeSettings(j);

      // ✅ hydrate 전/중 사용자가 바꾼 값(pending)이 있으면 pending 우선 적용
      const pending = pendingPatchRef.current || {};
      const merged: SignupSettings = {
        selectedKeys:
          "selectedKeys" in pending
            ? Array.isArray(pending.selectedKeys)
              ? pending.selectedKeys.map(String)
              : []
            : server.selectedKeys,
        colWidthSteps:
          "colWidthSteps" in pending && isPlainObject(pending.colWidthSteps)
            ? (pending.colWidthSteps as Record<string, number>)
            : server.colWidthSteps,
        rowCount: "rowCount" in pending ? Math.max(1, Math.floor(Number(pending.rowCount))) : server.rowCount,
        partnerOptions:
          "partnerOptions" in pending
            ? Array.isArray(pending.partnerOptions)
              ? pending.partnerOptions.map(String)
              : []
            : server.partnerOptions,
      };

      setSelectedKeys(merged.selectedKeys);
      setColWidthSteps(merged.colWidthSteps);
      setRowCount(merged.rowCount);
      setPartnerOptions(merged.partnerOptions);

      // ref 즉시 동기화(언마운트 flush 안전)
      latestSelectedKeysRef.current = merged.selectedKeys;
      latestColWidthStepsRef.current = merged.colWidthSteps;
      latestRowCountRef.current = merged.rowCount;
      latestPartnerOptionsRef.current = merged.partnerOptions;

      const wasHydrated = settingsHydratedRef.current;
      settingsHydratedRef.current = true;

      // 최초 hydrate 직후 pending이 있으면 1회 flush 예약
      if (!wasHydrated && Object.keys(pendingPatchRef.current || {}).length > 0) {
        queuePatch({});
      }
    } catch {
      const wasHydrated = settingsHydratedRef.current;
      settingsHydratedRef.current = true;
      if (!wasHydrated && Object.keys(pendingPatchRef.current || {}).length > 0) {
        queuePatch({});
      }
    }
  }

  function flushSettingsPatch(reason: "unmount" | "beforeunload") {
    if (patchTimerRef.current) {
      window.clearTimeout(patchTimerRef.current);
      patchTimerRef.current = null;
    }

    const pending = pendingPatchRef.current || {};
    const hasPending = Object.keys(pending).length > 0;

    if (!settingsHydratedRef.current) {
      if (!hasPending) return;
      pendingPatchRef.current = {};

      void patchSettingsNow(pending, true)
        .then(() => emitUnifiedUpdateThrottled())
        .catch(() => {
          pendingPatchRef.current = { ...pending, ...pendingPatchRef.current };
        });
      return;
    }

    // ✅ selectedKeys는 snapshot에 포함하지 않는다(덮어쓰기 방지)
    const snapshot: Partial<SignupSettings> = {
      colWidthSteps: latestColWidthStepsRef.current,
      rowCount: latestRowCountRef.current,
      partnerOptions: latestPartnerOptionsRef.current,
    };

    // ✅ pending에 selectedKeys가 있을 때만 포함(즉시저장 실패 케이스)
    const pendingSelectedKeys =
      "selectedKeys" in pending
        ? Array.isArray((pending as any).selectedKeys)
          ? ((pending as any).selectedKeys as string[])
          : []
        : null;

    const body: Partial<SignupSettings> = {
      ...pending,
      ...snapshot,
      ...(pendingSelectedKeys ? { selectedKeys: pendingSelectedKeys } : {}),
    };

    // ✅ 만약 pending에 selectedKeys가 없으면, selectedKeys는 보내지 않음
    if (!pendingSelectedKeys) {
      const { selectedKeys: _drop, ...rest } = body as any;
      (body as any).selectedKeys = undefined;
      // @ts-ignore
      delete body.selectedKeys;
      Object.assign(body, rest);
    }

    pendingPatchRef.current = {};

    void patchSettingsNow(body, reason === "beforeunload")
      .then(() => emitUnifiedUpdateThrottled())
      .catch(() => {
        pendingPatchRef.current = { ...body, ...pendingPatchRef.current };
      });
  }

  // ---------------------------------------------------------------------------
  // ✅ (핵심) 내 탭에서 편집 직후에는 syncListen의 reload가 rows를 덮어쓰지 못하게 차단
  // ---------------------------------------------------------------------------
  const LOCAL_EDIT_GRACE_MS = 2000;
  const lastLocalEditAtRef = useRef<number>(0);
  const pendingSyncReloadRef = useRef(false);

  function markLocalEdit() {
    lastLocalEditAtRef.current = Date.now();
  }

  function ensureSettingsReloadScheduled() {
    if (settingsReloadTimerRef.current) return;
    settingsReloadTimerRef.current = window.setTimeout(() => {
      void loadSettings();
      settingsReloadTimerRef.current = null;
    }, 1200);
  }

  function scheduleReloadFromSync() {
    pendingSyncReloadRef.current = true;

    // settings는 별도로(기존대로) 스로틀 reload
    ensureSettingsReloadScheduled();

    // 로컬 편집 직후면, 편집이 끝날 때까지 reload를 늦춘다(덮어쓰기/점멸 방지)
    const now = Date.now();
    const elapsed = now - lastLocalEditAtRef.current;
    if (elapsed < LOCAL_EDIT_GRACE_MS) {
      const wait = Math.max(50, LOCAL_EDIT_GRACE_MS - elapsed + 120);
      if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = window.setTimeout(() => {
        reloadTimerRef.current = null;
        scheduleReloadFromSync();
      }, wait);
      return;
    }

    // 짧은 디바운스(여러 sync 이벤트가 연속으로 들어오는 경우 1회만 reload)
    if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = window.setTimeout(() => {
      (async () => {
        if (!pendingSyncReloadRef.current) return;
        pendingSyncReloadRef.current = false;

        await draft.reload();
        setRowsReloadToken((v) => v + 1);
      })().catch(() => {});
      reloadTimerRef.current = null;
    }, 350);
  }

  useEffect(() => {
    void loadColumns();
    void loadSettings();

    return () => {
      flushSettingsPatch("unmount");
      if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
      if (settingsReloadTimerRef.current) window.clearTimeout(settingsReloadTimerRef.current);
      if (emitTimerRef.current) window.clearTimeout(emitTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onBeforeUnload = () => {
      flushSettingsPatch("beforeunload");
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const off = syncListen(() => {
      scheduleReloadFromSync();
    });
    return () => {
      off?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredSelectedKeys = useMemo(() => selectedKeys, [selectedKeys]);

  return (
    <div className="w-full h-full flex flex-col p-3 gap-3 bg-white">
      <div className="flex items-center gap-3">
        <div className="text-base font-semibold text-slate-800">신규가입</div>
        <button
          type="button"
          className="text-xs px-3 py-[6px] rounded bg-yellow-50 hover:bg-yellow-100 border disabled:opacity-60"
          onClick={() => setPickerOpen(true)}
          disabled={loadingColumns}
        >
          양식
        </button>
      </div>

      {error && <div className="text-xs text-red-600">{error}</div>}

      <SignupGrid
        allColumns={allColumns}
        selectedKeys={filteredSelectedKeys}
        loadingColumns={loadingColumns}
        onError={(msg) => setError(toUserMessage(msg))}
        initialColWidthSteps={colWidthSteps}
        initialRowCount={rowCount}
        partnerOptions={partnerOptions}
        onAddPartnerOption={async (name) => {
          const next = Array.from(new Set([...(partnerOptions || []), String(name || "").trim()])).filter(Boolean);
          setPartnerOptions(next);
          queuePatch({ partnerOptions: next });
        }}
        initialRows={draft.rows}
        rowsReloadToken={rowsReloadToken}
        onRowsChange={(nextRows) => {
          // ✅ 로컬 편집 시각 갱신: sync reload가 즉시 덮어쓰지 못하게
          markLocalEdit();
          draft.setRows(nextRows);
        }}
        onSubmitSuccess={async () => {
          // 전송 성공 → draft(데이터)만 삭제, 양식은 유지
          await draft.clear();

          // 전송 후에도 항상 40행 유지(빈 데이터)
          const KEEP_ROWS = 40;

          // ✅ UI 즉시 반영 + flush 레이스 방지(ref 즉시 동기화)
          setRowCount(KEEP_ROWS);
          latestRowCountRef.current = KEEP_ROWS;

          // ✅ DB에도 즉시 저장(바로 나가도 1로 덮어쓰이지 않게)
          await saveRowCountImmediately(KEEP_ROWS);
        }}
        onTransferFailed={(message) => {
          setTransferErrorMessage(String(message || "저장(전송)에 실패했습니다."));
          setTransferModalOpen(true);
        }}
        forceSubmitToken={forceSubmitToken}
        onColWidthStepsChange={(next) => {
          setColWidthSteps(next);
          queuePatch({ colWidthSteps: next });
        }}
        onRowCountChange={(count) => {
          const c = Math.max(1, Math.floor(Number(count)));
          setRowCount(c);
          // ✅ ref 즉시 동기화(언마운트 flush 안전)
          latestRowCountRef.current = c;
          queuePatch({ rowCount: c });
        }}
      />

      <SignupTransferErrorModal
        open={transferModalOpen}
        message={transferErrorMessage}
        onClose={() => setTransferModalOpen(false)}
        onForceTransfer={() => {
          setTransferModalOpen(false);
          setForceSubmitToken((v) => v + 1);
        }}
      />

      <UnifiedColumnPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        allColumns={allColumns}
        selectedKeys={selectedKeys}
        onChangeSelectedKeys={(next) => {
          setSelectedKeys(next);
          void saveSelectedKeysImmediately(next);
        }}
        onReloadColumns={loadColumns}
        loadingColumns={loadingColumns}
      />
    </div>
  );
}