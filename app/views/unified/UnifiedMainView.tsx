"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import GridHeader from "@/unified/components/GridHeader";
import UnifiedGrid, { UnifiedGridHandle } from "@/unified/components/UnifiedGrid";
import { useUnifiedColumnConfig } from "@/unified/column-config/useUnifiedColumnConfig";
import AddTemplateModal from "@/unified/components/AddTemplateModal";
import { syncEmitUnifiedUpdate, syncPatch } from "@/global-sync/sync-engine";

import PartnerPickerPopover from "@/views/dataUpload/signup-grid/partner-picker/PartnerPickerPopover";

function normalizeName(v: any) {
  return String(v ?? "").trim();
}

function sortKorean(a: string, b: string) {
  return String(a).localeCompare(String(b), "ko");
}

type SignupSettings = {
  selectedKeys: string[];
  colWidthSteps: Record<string, number>;
  rowCount: number;
  partnerOptions: string[];
};

export default function UnifiedMainView() {
  const gridRef = useRef<UnifiedGridHandle | null>(null);
  const [isColumnEditMode, setIsColumnEditMode] = useState(false);
  const [isAddTemplateOpen, setIsAddTemplateOpen] = useState(false);

  const {
    availableColumns,
    columnOrder,
    setColumnOrder,
    colWidthUnitByKey,
    setColWidthUnitByKey,
    reloadAllColumnState,
  } = useUnifiedColumnConfig();

  const referenceOptions = useMemo(() => availableColumns, [availableColumns]);

  async function addTemplate(args: { name: string; referenceKey: string; position: "after" | "before" }) {
    const r = await fetch("/api/unified-columns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });

    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(t || `FAILED(${r.status})`);
    }

    syncEmitUnifiedUpdate();
    await reloadAllColumnState();
  }

  async function deleteTemplate(key: string) {
    const r = await fetch("/api/unified-columns", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });

    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(t || `FAILED(${r.status})`);
    }

    syncEmitUnifiedUpdate();
    await reloadAllColumnState();
  }

  // ---------------------------------------------------------------------------
  // ✅ 거래처분류 팝오버(통합관리에서도 동일 동작)
  // - 옵션은 DB(/api/signup-settings)에서만 로드/저장
  // - 선택 시 syncPatch(id, "거래처분류", 값)
  // - UnifiedGrid 코어는 수정하지 않고, View에서 이벤트 위임만 추가
  // ---------------------------------------------------------------------------
  const [partnerOptions, setPartnerOptions] = useState<string[]>([]);
  const partnerOptionsRef = useRef<string[]>([]);
  useEffect(() => {
    partnerOptionsRef.current = partnerOptions;
  }, [partnerOptions]);

  const [partnerPopover, setPartnerPopover] = useState<{
    open: boolean;
    x: number;
    y: number;
    unifiedId: number | null;
    currentValue: string;
  }>({
    open: false,
    x: 0,
    y: 0,
    unifiedId: null,
    currentValue: "",
  });

  async function loadPartnerOptions() {
    try {
      const r = await fetch("/api/signup-settings", { cache: "no-store" });
      if (!r.ok) return;

      const j = (await r.json()) as Partial<SignupSettings> | null;
      const list = Array.isArray(j?.partnerOptions) ? j!.partnerOptions.map(String) : [];

      const merged = Array.from(new Set(list.map(normalizeName).filter(Boolean)));
      merged.sort(sortKorean);
      setPartnerOptions(merged);
    } catch {
      // ignore
    }
  }

  async function savePartnerOptions(next: string[]) {
    const merged = Array.from(new Set((next || []).map(normalizeName).filter(Boolean)));
    merged.sort(sortKorean);

    const r = await fetch("/api/signup-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partnerOptions: merged }),
    });

    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(t || `FAILED(${r.status})`);
    }

    setPartnerOptions(merged);
    syncEmitUnifiedUpdate();
  }

  useEffect(() => {
    void loadPartnerOptions();
  }, []);

  // 드래그/클릭 구분(임계치) — 드래그를 방해하지 않고 "클릭일 때만" 팝오버 오픈
  const partnerDownRef = useRef<{
    pending: boolean;
    startX: number;
    startY: number;
    unifiedId: number;
    currentValue: string;
  } | null>(null);

  const OPEN_THRESHOLD_PX = 4;

  function findPartnerCellInfoFromTarget(t: HTMLElement | null) {
    if (!t) return null;

    const td = t.closest("td[data-col-key]") as HTMLElement | null;
    if (!td) return null;

    const colKey = String((td as any).dataset?.colKey ?? "");
    if (colKey !== "거래처분류") return null;

    const tr = td.closest("tr[data-unified-id]") as HTMLElement | null;
    if (!tr) return null;

    const id = Number((tr as any).dataset?.unifiedId ?? 0);
    if (!Number.isFinite(id) || id <= 0) return null;

    // 현재 입력값은 input value 우선(없으면 td 텍스트)
    const input = td.querySelector("input,select,textarea") as
      | HTMLInputElement
      | HTMLSelectElement
      | HTMLTextAreaElement
      | null;
    const currentValue = normalizeName(input?.value ?? td.textContent ?? "");

    return { unifiedId: id, currentValue };
  }

  function onGridMouseDownCapture(e: React.MouseEvent) {
    if (isColumnEditMode) return;
    if (e.button !== 0) return;

    const t = e.target as HTMLElement | null;
    const info = findPartnerCellInfoFromTarget(t);
    if (!info) return;

    // ✅ 거래처분류 셀은 "클릭 팝오버"가 목적이므로,
    // input 포커스로 들어가서 락획득/blur 저장이 발생하지 않게 막는다.
    e.preventDefault();

    partnerDownRef.current = {
      pending: true,
      startX: e.clientX,
      startY: e.clientY,
      unifiedId: info.unifiedId,
      currentValue: info.currentValue,
    };
  }

  function onGridMouseMoveCapture(e: React.MouseEvent) {
    const st = partnerDownRef.current;
    if (!st || !st.pending) return;

    const dx = Math.abs(e.clientX - st.startX);
    const dy = Math.abs(e.clientY - st.startY);

    // 드래그면 팝오버 취소(그리드 선택/드래그 흐름 유지)
    if (dx >= OPEN_THRESHOLD_PX || dy >= OPEN_THRESHOLD_PX) {
      partnerDownRef.current = null;
    }
  }

  function onGridMouseUpCapture(e: React.MouseEvent) {
    const st = partnerDownRef.current;
    partnerDownRef.current = null;
    if (!st || !st.pending) return;

    setPartnerPopover({
      open: true,
      x: e.clientX,
      y: e.clientY,
      unifiedId: st.unifiedId,
      currentValue: st.currentValue,
    });
  }

  return (
    <div className="w-full h-full flex flex-col">
      <div style={{ height: "0.3cm" }} />

      <GridHeader
        onAdd10={async () => {
          await gridRef.current?.appendBlankRows(10);
        }}
        isColumnEditMode={isColumnEditMode}
        onToggleColumnEditMode={() => setIsColumnEditMode((v) => !v)}
        onAddTemplate={() => setIsAddTemplateOpen(true)}
      />

      {/* ✅ UnifiedGrid는 동결: wrapper에서 이벤트 위임만 추가 */}
      <div
        className="flex-1 min-h-0"
        onMouseDownCapture={onGridMouseDownCapture}
        onMouseMoveCapture={onGridMouseMoveCapture}
        onMouseUpCapture={onGridMouseUpCapture}
      >
        <UnifiedGrid
          ref={gridRef}
          isColumnEditMode={isColumnEditMode}
          columnOrder={columnOrder}
          onColumnOrderChange={setColumnOrder}
          colWidthUnitByKey={colWidthUnitByKey}
          onColWidthUnitByKeyChange={setColWidthUnitByKey}
        />
      </div>

      <AddTemplateModal
        open={isAddTemplateOpen}
        onClose={() => setIsAddTemplateOpen(false)}
        referenceOptions={referenceOptions}
        onAdd={addTemplate}
        onDelete={deleteTemplate}
      />

      {/* ✅ 거래처분류 팝오버 */}
      <PartnerPickerPopover
        open={partnerPopover.open}
        x={partnerPopover.x}
        y={partnerPopover.y}
        options={partnerOptions}
        value={partnerPopover.currentValue}
        onSelect={async (name) => {
          const unifiedId = partnerPopover.unifiedId;
          if (!unifiedId) return;

          const next = normalizeName(name);
          await syncPatch(unifiedId, "거래처분류", next);

          setPartnerPopover((p) => ({ ...p, open: false, unifiedId: null }));
        }}
        onClose={() => setPartnerPopover((p) => ({ ...p, open: false, unifiedId: null }))}
        onAdd={async (raw) => {
          const n = normalizeName(raw);
          if (!n) return;

          const nextOptions = Array.from(new Set([...(partnerOptionsRef.current || []), n])).filter(Boolean);
          await savePartnerOptions(nextOptions);

          const unifiedId = partnerPopover.unifiedId;
          if (unifiedId) {
            await syncPatch(unifiedId, "거래처분류", n);
          }

          setPartnerPopover((p) => ({ ...p, open: false, unifiedId: null }));
        }}
        onDelete={async (raw) => {
          const n = normalizeName(raw);
          if (!n) return;

          const nextOptions = (partnerOptionsRef.current || []).filter((x) => normalizeName(x) !== n);
          await savePartnerOptions(nextOptions);

          const unifiedId = partnerPopover.unifiedId;
          if (unifiedId && normalizeName(partnerPopover.currentValue) === n) {
            await syncPatch(unifiedId, "거래처분류", "");
          }

          setPartnerPopover((p) => ({ ...p, open: false, unifiedId: null }));
        }}
      />
    </div>
  );
}