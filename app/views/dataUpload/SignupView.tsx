"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import UnifiedColumnPickerModal from "@/views/dataUpload/components/UnifiedColumnPickerModal";
import SignupGrid from "@/views/dataUpload/components/SignupGrid";

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

  // 서버/DB 에러 원문(영문)을 사용자 화면에 그대로 보여주지 않기 위한 치환
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
    // 설정 로딩 실패로 인해 화면 상단에 영문(DB 에러) 한 줄이 노출되던 문제를 방지:
    // - 실패해도 기본값으로 진행
    // - 사용자 화면에는 에러 원문을 표시하지 않음
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
    // 초기 hydrate 전에는 PATCH를 보내지 않음
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
        if (!r.ok) {
          // 에러 원문(영문) 노출 방지: 사용자 메시지로만 표시
          setError("설정 저장에 실패했습니다.");
        }
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

  const filteredSelectedKeys = useMemo(() => {
    // 컬럼 목록이 아직 로드 전이어도 UI 흐름을 깨지 않기 위해 그대로 두되,
    // Grid에서 실제 렌더는 allColumns 기준으로 필터링됨
    return selectedKeys;
  }, [selectedKeys]);

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