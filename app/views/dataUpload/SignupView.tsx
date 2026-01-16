"use client";

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

  useEffect(() => {
    void loadColumns();
    void loadSettings();

    return () => {
      if (patchTimerRef.current) window.clearTimeout(patchTimerRef.current);
    };
  }, []);

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

  // 다른 탭/화면에서 unified.update 이벤트가 오면 draft 다시 로드
  useEffect(() => {
    const off = syncListen(() => {
      void draft.reload();
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