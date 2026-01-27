"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import GridHeader from "@/unified/components/GridHeader";
import UnifiedGrid, { UnifiedGridHandle } from "@/unified/components/UnifiedGrid";
import { useUnifiedColumnConfig } from "@/unified/column-config/useUnifiedColumnConfig";
import AddTemplateModal from "@/unified/components/AddTemplateModal";
import { syncEmitUnifiedUpdate, syncListen, syncPatch } from "@/global-sync/sync-engine";

import PartnerPickerPopover from "@/views/dataUpload/signup-grid/partner-picker/PartnerPickerPopover";
import PartnerGuidePanel from "@/views/unified/components/PartnerGuidePanel";

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

  // ✅ 안내분류(거래처별) 설정 패널: 안내분류 셀 클릭으로 오픈
  const [isPartnerGuideOpen, setIsPartnerGuideOpen] = useState(false);
  const [guidePanelInitialPartner, setGuidePanelInitialPartner] = useState<string>("");

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
  // 거래처분류 옵션 로딩(통합관리) + 실시간 옵션 갱신
  // ---------------------------------------------------------------------------
  const [partnerOptions, setPartnerOptions] = useState<string[]>([]);
  const partnerOptionsRef = useRef<string[]>([]);
  useEffect(() => {
    partnerOptionsRef.current = partnerOptions;
  }, [partnerOptions]);

  async function loadPartnerOptionsNoStore() {
    const r = await fetch("/api/signup-settings", { cache: "no-store" });
    if (!r.ok) return;

    const j = (await r.json()) as Partial<SignupSettings> | null;
    const list = Array.isArray(j?.partnerOptions) ? j!.partnerOptions.map(String) : [];

    const merged = Array.from(new Set(list.map(normalizeName).filter(Boolean)));
    merged.sort(sortKorean);
    setPartnerOptions(merged);
  }

  async function patchPartnerOptionsNoStore(next: string[]) {
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

    await loadPartnerOptionsNoStore();
    syncEmitUnifiedUpdate();
  }

  useEffect(() => {
    void loadPartnerOptionsNoStore();
  }, []);

  const partnerReloadTimerRef = useRef<number | null>(null);
  useEffect(() => {
    const off = syncListen(() => {
      if (partnerReloadTimerRef.current) window.clearTimeout(partnerReloadTimerRef.current);
      partnerReloadTimerRef.current = window.setTimeout(() => {
        partnerReloadTimerRef.current = null;
        void loadPartnerOptionsNoStore();
      }, 200);
    });

    return () => {
      off?.();
      if (partnerReloadTimerRef.current) window.clearTimeout(partnerReloadTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // 거래처분류 셀 클릭 → 거래처 팝오버
  // 안내분류 셀 클릭 → 안내분류 패널
  // ---------------------------------------------------------------------------
  const [partnerPopover, setPartnerPopover] = useState<{
    open: boolean;
    x: number;
    y: number;
    unifiedId: number | null;
    currentValue: string;
  }>({ open: false, x: 0, y: 0, unifiedId: null, currentValue: "" });

  const OPEN_THRESHOLD_PX = 4;

  const partnerDownRef = useRef<{
    pending: boolean;
    startX: number;
    startY: number;
    unifiedId: number;
    currentValue: string;
  } | null>(null);

  const guideDownRef = useRef<{
    pending: boolean;
    startX: number;
    startY: number;
    partnerName: string;
  } | null>(null);

  function findCellTd(t: HTMLElement | null) {
    if (!t) return null;
    return t.closest("td[data-col-key]") as HTMLElement | null;
  }

  function findRowTrFromTd(td: HTMLElement | null) {
    if (!td) return null;
    return td.closest("tr[data-unified-id]") as HTMLElement | null;
  }

  function getRowIdFromTr(tr: HTMLElement | null) {
    if (!tr) return null;
    const id = Number((tr as any).dataset?.unifiedId ?? 0);
    if (!Number.isFinite(id) || id <= 0) return null;
    return id;
  }

  function readCellValue(td: HTMLElement | null) {
    if (!td) return "";
    const input = td.querySelector("input,select,textarea") as
      | HTMLInputElement
      | HTMLSelectElement
      | HTMLTextAreaElement
      | null;
    return normalizeName(input?.value ?? td.textContent ?? "");
  }

  function findPartnerCellInfoFromTarget(t: HTMLElement | null) {
    const td = findCellTd(t);
    if (!td) return null;

    const colKey = String((td as any).dataset?.colKey ?? "");
    if (colKey !== "거래처분류") return null;

    const tr = findRowTrFromTd(td);
    const id = getRowIdFromTr(tr);
    if (!id) return null;

    const currentValue = readCellValue(td);
    return { unifiedId: id, currentValue };
  }

  function findGuideCellInfoFromTarget(t: HTMLElement | null) {
    const td = findCellTd(t);
    if (!td) return null;

    const colKey = String((td as any).dataset?.colKey ?? "");
    if (colKey !== "안내분류") return null;

    const tr = findRowTrFromTd(td);
    if (!tr) return { partnerName: "" };

    const partnerTd = tr.querySelector('td[data-col-key="거래처분류"]') as HTMLElement | null;
    const partnerName = readCellValue(partnerTd);

    return { partnerName };
  }

  function onGridMouseDownCapture(e: React.MouseEvent) {
    if (isColumnEditMode) return;
    if (e.button !== 0) return;

    const t = e.target as HTMLElement | null;

    const partnerInfo = findPartnerCellInfoFromTarget(t);
    if (partnerInfo) {
      e.preventDefault();
      e.stopPropagation();

      partnerDownRef.current = {
        pending: true,
        startX: e.clientX,
        startY: e.clientY,
        unifiedId: partnerInfo.unifiedId,
        currentValue: partnerInfo.currentValue,
      };
      return;
    }

    const guideInfo = findGuideCellInfoFromTarget(t);
    if (guideInfo) {
      e.preventDefault();
      e.stopPropagation();

      guideDownRef.current = {
        pending: true,
        startX: e.clientX,
        startY: e.clientY,
        partnerName: guideInfo.partnerName,
      };
      return;
    }
  }

  function onGridMouseMoveCapture(e: React.MouseEvent) {
    const st1 = partnerDownRef.current;
    if (st1?.pending) {
      const dx = Math.abs(e.clientX - st1.startX);
      const dy = Math.abs(e.clientY - st1.startY);
      if (dx >= OPEN_THRESHOLD_PX || dy >= OPEN_THRESHOLD_PX) partnerDownRef.current = null;
    }

    const st2 = guideDownRef.current;
    if (st2?.pending) {
      const dx = Math.abs(e.clientX - st2.startX);
      const dy = Math.abs(e.clientY - st2.startY);
      if (dx >= OPEN_THRESHOLD_PX || dy >= OPEN_THRESHOLD_PX) guideDownRef.current = null;
    }
  }

  function onGridMouseUpCapture(e: React.MouseEvent) {
    const st1 = partnerDownRef.current;
    partnerDownRef.current = null;
    if (st1?.pending) {
      setPartnerPopover({
        open: true,
        x: e.clientX,
        y: e.clientY,
        unifiedId: st1.unifiedId,
        currentValue: st1.currentValue,
      });
      return;
    }

    const st2 = guideDownRef.current;
    guideDownRef.current = null;
    if (st2?.pending) {
      setGuidePanelInitialPartner(normalizeName(st2.partnerName));
      setIsPartnerGuideOpen(true);
    }
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
          await patchPartnerOptionsNoStore(nextOptions);

          const unifiedId = partnerPopover.unifiedId;
          if (unifiedId) await syncPatch(unifiedId, "거래처분류", n);
        }}
        onDelete={async (raw) => {
          const n = normalizeName(raw);
          if (!n) return;

          const nextOptions = (partnerOptionsRef.current || []).filter((x) => normalizeName(x) !== n);
          await patchPartnerOptionsNoStore(nextOptions);

          const unifiedId = partnerPopover.unifiedId;
          if (unifiedId && normalizeName(partnerPopover.currentValue) === n) {
            await syncPatch(unifiedId, "거래처분류", "");
          }
        }}
      />

      <PartnerGuidePanel
        open={isPartnerGuideOpen}
        onClose={() => setIsPartnerGuideOpen(false)}
        partnerOptions={partnerOptions}
        initialPartner={guidePanelInitialPartner}
        onChanged={() => {
          syncEmitUnifiedUpdate();
        }}
      />
    </div>
  );
}