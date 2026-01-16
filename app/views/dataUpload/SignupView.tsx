"use client";

// 소켓 클라이언트는 이 import(사이드이펙트)로 연결/조인이 보장됨 (코어 수정 없이 "호출/사용"만)
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

  const settingsHydratedRef = useRef(false);
  const patchTimerRef = useRef<number | null>(null);
  const pendingPatchRef = useRef<Partial<SignupSettings>>({});

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

  async function loadSettings() {
    try {
      const r = await fetch("/api/signup-settings", { cache: "no-store" });
      if (!r.ok) {
        settingsHydratedRef.current = true;
        return;
      }

      const j = (await r.json()) as Partial<SignupSettings> | null;

      const nextSelectedKeys = Array.isArray(j?.selectedKeys) ? j!.selectedKeys.map(String) : DEFAULT_SETTINGS.selectedKeys;
      const nextColWidthSteps =
        j?.colWidthSteps && typeof j.colWidthSteps === "object" ? (j.colWidthSteps as Record<string, number>) : DEFAULT_SETTINGS.colWidthSteps;
      const nextRowCount = Number.isFinite(Number(j?.rowCount)) ? Math.max(1, Math.floor(Number(j?.rowCount))) : DEFAULT_SETTINGS.rowCount;
      const nextPartnerOptions = Array.isArray(j?.partnerOptions) ? j!.partnerOptions.map(String) : DEFAULT_SETTINGS.partnerOptions;

      setSelectedKeys(nextSelectedKeys);
      setColWidthSteps(nextColWidthSteps);
      setRowCount(nextRowCount);
      setPartnerOptions(nextPartnerOptions);

      settingsHydratedRef.current = true;
    } catch {
      settingsHydratedRef.current = true;
    }
  }

  function queuePatch(partial: Partial<SignupSettings>) {
    if (!settingsHydratedRef.current) return;

    pendingPatchRef.current = { ...pendingPatchRef.current, ...partial };

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

  // 페이지 이탈 시 settings 저장 누락 방지(특히 열넓이)
  async function flushSettingsPatch(reason: "unmount" | "beforeunload") {
    if (!settingsHydratedRef.current) return;

    if (patchTimerRef.current) {
      window.clearTimeout(patchTimerRef.current);
      patchTimerRef.current = null;
    }

    // pending이 있든 없든 현재 스냅샷을 1번 저장(열넓이 등 누락 방지)
    const snapshot: SignupSettings = {
      selectedKeys: Array.isArray(selectedKeys) ? selectedKeys : [],
      colWidthSteps: colWidthSteps && typeof colWidthSteps === "object" ? colWidthSteps : {},
      rowCount: Number.isFinite(Number(rowCount)) ? Number(rowCount) : 1,
      partnerOptions: Array.isArray(partnerOptions) ? partnerOptions : [],
    };

    // pendingPatch와 합쳐서 보냄(중복 포함돼도 PATCH merge로 안전)
    const body: Partial<SignupSettings> = { ...pendingPatchRef.current, ...snapshot };
    pendingPatchRef.current = {};

    try {
      await fetch("/api/signup-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        // beforeunload 상황에서도 최대한 전송 시도
        keepalive: reason === "beforeunload",
      });
    } catch {
      // 이탈 중에는 에러 표시로 UX 깨지 않게 무시
    }
  }

  useEffect(() => {
    void loadColumns();
    void loadSettings();

    return () => {
      void flushSettingsPatch("unmount");
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

  // selectedKeys 변경 시 DB 저장
  useEffect(() => {
    queuePatch({ selectedKeys });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKeys]);

  const filteredSelectedKeys = useMemo(() => selectedKeys, [selectedKeys]);

  // Draft(임시입력값) 자동저장/복원: unified 테이블에 data로 저장
  const draft = useSignupDraft({
    onError: (msg) => setError(toUserMessage(msg)),
  });

  // 다른 탭/화면에서 unified.update 이벤트가 오면 draft + settings 재로드
  useEffect(() => {
    const off = syncListen(() => {
      void draft.reload();
      void loadSettings();
    });
    return () => {
      off?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        onChangeSelectedKeys={(next) => setSelectedKeys(next)}
        onReloadColumns={loadColumns}
        loadingColumns={loadingColumns}
      />
    </div>
  );
}