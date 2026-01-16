"use client";

// 소켓 클라이언트 연결 보장(코어 수정 없이 import만)
import "@/global-socket/socket-client";

import { useEffect, useMemo, useRef, useState } from "react";
import UnifiedColumnPickerModal from "@/views/dataUpload/components/UnifiedColumnPickerModal";
import SignupGrid from "@/views/dataUpload/components/SignupGrid";
import { useSignupDraft } from "@/views/dataUpload/signup-draft/useSignupDraft";
import { syncListen } from "@/global-sync/sync-engine";

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

  // settings (DB/API 기반)
  const [colWidthSteps, setColWidthSteps] = useState<Record<string, number>>(DEFAULT_SETTINGS.colWidthSteps);
  const [rowCount, setRowCount] = useState<number>(DEFAULT_SETTINGS.rowCount);
  const [partnerOptions, setPartnerOptions] = useState<string[]>(DEFAULT_SETTINGS.partnerOptions);

  // settings hydrate / patch queue
  const settingsHydratedRef = useRef(false);
  const patchTimerRef = useRef<number | null>(null);

  // hydrate 전/후 상관없이 여기에 누적(단, 사용자 액션에서만 넣는 방식)
  const pendingPatchRef = useRef<Partial<SignupSettings>>({});

  // unified.update 수신 시 reload 폭주 방지(점멸 방지)
  const reloadTimerRef = useRef<number | null>(null);
  const settingsReloadTimerRef = useRef<number | null>(null);

  // 다른 탭 수정 내용을 Grid에 "강제 적용"하기 위한 토큰
  const [rowsReloadToken, setRowsReloadToken] = useState(0);

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
    const nextRowCount = Number.isFinite(Number(j?.rowCount)) ? Math.max(1, Math.floor(Number(j?.rowCount))) : DEFAULT_SETTINGS.rowCount;
    const nextPartnerOptions = Array.isArray(j?.partnerOptions) ? j.partnerOptions.map(String) : DEFAULT_SETTINGS.partnerOptions;

    return {
      selectedKeys: nextSelectedKeys,
      colWidthSteps: nextColWidthSteps,
      rowCount: nextRowCount,
      partnerOptions: nextPartnerOptions,
    };
  }

  async function loadSettings() {
    try {
      const r = await fetch("/api/signup-settings", { cache: "no-store" });
      if (!r.ok) {
        settingsHydratedRef.current = true;
        return;
      }

      const j = (await r.json()) as Partial<SignupSettings> | null;
      const server = normalizeSettings(j);

      // ✅ hydrate 전/중 사용자가 바꾼 값이 있으면( pendingPatchRef ) 그 값을 우선 적용
      const pending = pendingPatchRef.current || {};
      const merged: SignupSettings = {
        selectedKeys:
          "selectedKeys" in pending ? (Array.isArray(pending.selectedKeys) ? pending.selectedKeys.map(String) : []) : server.selectedKeys,
        colWidthSteps:
          "colWidthSteps" in pending && isPlainObject(pending.colWidthSteps) ? (pending.colWidthSteps as Record<string, number>) : server.colWidthSteps,
        rowCount: "rowCount" in pending ? Math.max(1, Math.floor(Number(pending.rowCount))) : server.rowCount,
        partnerOptions:
          "partnerOptions" in pending ? (Array.isArray(pending.partnerOptions) ? pending.partnerOptions.map(String) : []) : server.partnerOptions,
      };

      setSelectedKeys(merged.selectedKeys);
      setColWidthSteps(merged.colWidthSteps);
      setRowCount(merged.rowCount);
      setPartnerOptions(merged.partnerOptions);

      const wasHydrated = settingsHydratedRef.current;
      settingsHydratedRef.current = true;

      // ✅ 최초 hydrate 직후 pending이 있으면 1회 flush 예약
      if (!wasHydrated && Object.keys(pendingPatchRef.current || {}).length > 0) {
        queuePatch({});
      }
    } catch {
      settingsHydratedRef.current = true;
    }
  }

  function queuePatch(partial: Partial<SignupSettings>) {
    // ✅ hydrate 전에도 pending에 누적(유실 방지)
    pendingPatchRef.current = { ...pendingPatchRef.current, ...partial };

    // hydrate 전이면 실제 PATCH는 하지 않음
    if (!settingsHydratedRef.current) return;

    if (patchTimerRef.current) window.clearTimeout(patchTimerRef.current);
    patchTimerRef.current = window.setTimeout(async () => {
      const body = pendingPatchRef.current;
      pendingPatchRef.current = {};

      try {
        const r = await fetch("/api/signup-settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!r.ok) setError("설정 저장에 실패했습니다.");
      } catch {
        setError("설정 저장에 실패했습니다.");
      }
    }, 250);
  }

  // 페이지 이탈 시 settings 저장 누락 방지
  async function flushSettingsPatch(reason: "unmount" | "beforeunload") {
    if (!settingsHydratedRef.current) return;

    if (patchTimerRef.current) {
      window.clearTimeout(patchTimerRef.current);
      patchTimerRef.current = null;
    }

    const snapshot: SignupSettings = {
      selectedKeys: Array.isArray(selectedKeys) ? selectedKeys : [],
      colWidthSteps: colWidthSteps && typeof colWidthSteps === "object" ? colWidthSteps : {},
      rowCount: Number.isFinite(Number(rowCount)) ? Number(rowCount) : 1,
      partnerOptions: Array.isArray(partnerOptions) ? partnerOptions : [],
    };

    const body: Partial<SignupSettings> = { ...pendingPatchRef.current, ...snapshot };
    pendingPatchRef.current = {};

    try {
      await fetch("/api/signup-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive: reason === "beforeunload",
      });
    } catch {}
  }

  // unified.update 수신 시: reload를 디바운스해서 점멸 방지 + Grid 반영 토큰 증가
  function scheduleReloadFromSync() {
    if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = window.setTimeout(() => {
      (async () => {
        await draft.reload();
        setRowsReloadToken((v) => v + 1);
      })().catch(() => {});
      reloadTimerRef.current = null;
    }, 350);

    if (settingsReloadTimerRef.current) return;
    settingsReloadTimerRef.current = window.setTimeout(() => {
      void loadSettings();
      settingsReloadTimerRef.current = null;
    }, 1200);
  }

  useEffect(() => {
    void loadColumns();
    void loadSettings();

    return () => {
      void flushSettingsPatch("unmount");
      if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
      if (settingsReloadTimerRef.current) window.clearTimeout(settingsReloadTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onBeforeUnload = () => {
      void flushSettingsPatch("beforeunload");
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKeys, colWidthSteps, rowCount, partnerOptions]);

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
          draft.setRows(nextRows);
        }}
        onSubmitSuccess={async () => {
          await draft.clear();
        }}
        onColWidthStepsChange={(next) => {
          setColWidthSteps(next);
          queuePatch({ colWidthSteps: next });
        }}
        onRowCountChange={(count) => {
          setRowCount(count);
          queuePatch({ rowCount: count });
        }}
      />

      <UnifiedColumnPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        allColumns={allColumns}
        selectedKeys={selectedKeys}
        onChangeSelectedKeys={(next) => {
          setSelectedKeys(next);
          // ✅ selectedKeys 저장은 "사용자 액션"에서만 트리거
          queuePatch({ selectedKeys: next });
        }}
        onReloadColumns={loadColumns}
        loadingColumns={loadingColumns}
      />
    </div>
  );
}