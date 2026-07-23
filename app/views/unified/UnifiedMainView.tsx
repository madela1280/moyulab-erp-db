// app/views/unified/UnifiedMainView.tsx

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import GridHeader from "@/unified/components/GridHeader";
import UnifiedGrid, { UnifiedGridHandle } from "@/unified/components/UnifiedGrid";
import { useUnifiedColumnConfig } from "@/unified/column-config/useUnifiedColumnConfig";
import AddTemplateModal from "@/unified/components/AddTemplateModal";
import { syncEmitUnifiedUpdate, syncListen, syncPatch } from "@/global-sync/sync-engine";

import PartnerPickerPopover from "@/views/dataUpload/signup-grid/partner-picker/PartnerPickerPopover";
import PartnerGuidePanel from "@/views/unified/components/PartnerGuidePanel";

import ExtensionEditPanel from "@/views/unified/extensions/ExtensionEditPanel";
import { computeEndDateFromStartAndTotalDays } from "@/views/unified/extensions/extensionDate";
import { type ExtensionCellFields } from "@/views/unified/extensions/extensionFormat";
import { sumExtensionDaysFromRow } from "@/views/unified/extensions/extensionCompute";

// ✅ (추가) 통합관리: 필터/칼라/다운로드(심포니와 동일 UX)
import ColorPopover, { type UnifiedSoftColor } from "@/unified/color/ColorPopover";
import type { ColorApplyMode } from "@/unified/color/ColorModeToggle";
import { createEmptyFilterState, type ColumnFilterState } from "@/unified/filter/useUnifiedFilter";
import { defaultSortState, type UnifiedSortState } from "@/unified/filter/useUnifiedSort";
import { exportUnifiedCsv } from "@/unified/export/serviceUnifiedExport";

// ✅ (추가) 통합관리 검색
import UnifiedSearchPanel from "@/unified/search/UnifiedSearchPanel";
import { useUnifiedSearch } from "@/unified/search/useUnifiedSearch";
import { buildUnifiedSearchHighlight } from "@/unified/search/buildUnifiedSearchHighlight";
import { useUnifiedMigrationMode } from "@/unified/migration-mode/useUnifiedMigrationMode";

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

const EXT_KEYS = [
  "1차연장",
  "2차연장",
  "3차연장",
  "4차연장",
  "5차연장",
  "6차연장",
  "7차연장",
  "8차연장",
  "9차연장",
  "10차연장",
  "11차연장",
  "12차연장",
  "13차연장",
  "14차연장",
  "15차연장",
] as const;

type ExtKey = (typeof EXT_KEYS)[number];

export default function UnifiedMainView() {
  const gridRef = useRef<UnifiedGridHandle | null>(null);
  const [isColumnEditMode, setIsColumnEditMode] = useState(false);
  const [isAddTemplateOpen, setIsAddTemplateOpen] = useState(false);

  // ✅ 초기이관모드: ON일 때 붙여넣은 안내분류 원시값을 행 단위로 고정
  const migrationMode = useUnifiedMigrationMode();

  // ✅ (추가) 필터/정렬
  const [filterMode, setFilterMode] = useState(false);
  const [filterState, setFilterState] = useState<ColumnFilterState>(() => createEmptyFilterState());
  const [sortState, setSortState] = useState<UnifiedSortState>(() => defaultSortState());

  // ✅ filterMode가 꺼졌을 때는 Grid에 “항상 같은 참조”의 빈 상태를 내려서
  //    불필요한 재계산/흔들림을 줄임
  const emptyFilterStateRef = useRef<ColumnFilterState>(createEmptyFilterState());
  const emptySortStateRef = useRef<UnifiedSortState>(defaultSortState());

  const effectiveFilterState = filterMode ? filterState : emptyFilterStateRef.current;
  const effectiveSortState = filterMode ? sortState : emptySortStateRef.current;

  // ✅ (추가) 칼라
  const [colorOpen, setColorOpen] = useState(false);
  const [colorAnchor, setColorAnchor] = useState<{ x: number; y: number } | null>(null);

  // ✅ 안내분류(거래처별) 설정 패널: 안내분류 셀 클릭으로 오픈
  const [isPartnerGuideOpen, setIsPartnerGuideOpen] = useState(false);
  const [guidePanelInitialPartner, setGuidePanelInitialPartner] = useState<string>("");

  // ✅ 1~7차 연장 입력 패널
  const [extPanel, setExtPanel] = useState<{
    open: boolean;
    x: number;
    y: number;
    rowId: number | null;
    colKey: ExtKey | "";
    initialValue: string;
  }>({
    open: false,
    x: 0,
    y: 0,
    rowId: null,
    colKey: "",
    initialValue: "",
  });

   // ✅ 통합관리 검색
  const unifiedSearch = useUnifiedSearch({ limit: 300 });
  const [searchPanelAnchor, setSearchPanelAnchor] = useState<{ x: number; y: number } | null>(null);
  const [searchFocusVersion, setSearchFocusVersion] = useState(0);

  const searchHighlight = useMemo(
    () =>
      buildUnifiedSearchHighlight({
        results: unifiedSearch.results,
        currentIndex: unifiedSearch.currentIndex,
      }),
    [unifiedSearch.results, unifiedSearch.currentIndex]
  );

    function bumpSearchFocus(afterFrameCount = 0) {
    const run = (left: number) => {
      if (left <= 0) {
        setSearchFocusVersion((v) => v + 1);
        return;
      }
      requestAnimationFrame(() => run(left - 1));
    };
    run(afterFrameCount);
  }

  function openSearchPanel(anchor: { x: number; y: number }) {
    setSearchPanelAnchor(anchor);
    unifiedSearch.openSearch();
  }

  async function handleSearchSubmit(nextKeyword?: string) {
    try {
      const keyword = normalizeName(nextKeyword ?? unifiedSearch.keyword);
      unifiedSearch.setKeyword(keyword);

      const shouldReleaseFilter = filterMode;
      if (shouldReleaseFilter) {
        setFilterMode(false);
      }

      const res = await unifiedSearch.submitSearch(keyword);
      if (res && res.results.length > 0) {
        bumpSearchFocus(shouldReleaseFilter ? 2 : 0);
      }
    } catch {
      // 에러 표시는 훅 상태(error)로 처리
    }
  }

  function handleSearchNext() {
    const shouldReleaseFilter = filterMode;
    if (shouldReleaseFilter) {
      setFilterMode(false);
    }

    const moved = unifiedSearch.moveNext();
    if (moved) {
      bumpSearchFocus(shouldReleaseFilter ? 2 : 0);
    }
  }

  function handleSearchClose() {
    unifiedSearch.closeSearch();
    setSearchPanelAnchor(null);
  }

  // (결제수단 추가등록 기능은 다음 단계 — 지금은 고정 옵션 + 패널에서 직접입력 지원)
  const paymentOptions = useMemo(() => ["계좌이체", "서비스", "카드", "온라인연장"], []);

  useEffect(() => {
    if (!filterMode) return;
    if (!unifiedSearch.open) return;
    if (unifiedSearch.results.length <= 0) return;

    setFilterMode(false);
  }, [filterMode, unifiedSearch.open, unifiedSearch.results.length]);

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
  // ✅ (추가) 필터/칼라/다운로드 핸들러 (버튼 위치/모양은 GridHeader 그대로)
  // ---------------------------------------------------------------------------
  function handleToggleFilterMode() {
    if (filterMode) {
      setFilterMode(false);
      setFilterState(createEmptyFilterState());
      setSortState(defaultSortState());

      // ✅ 필터 OFF 후 “맨 위로 튐” 방지: 마지막 데이터 근처로 복귀
      requestAnimationFrame(() => {
        gridRef.current?.scrollToTailData?.();
      });

      return;
    }
    setFilterMode(true);
  }

  function openColor(anchor: { x: number; y: number }) {
    setColorAnchor(anchor);
    setColorOpen(true);
  }

  async function applyColor(color: UnifiedSoftColor, mode: ColorApplyMode) {
    // UnifiedGrid에 핸들러가 연결되면 동작
    const anyRef = gridRef.current as any;
    await anyRef?.applyColorToSelection?.(color, mode);
  }

  async function handleDownload() {
    const blob = await exportUnifiedCsv({ filter: { filterState, sortState } });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "unified.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ---------------------------------------------------------------------------
  // 셀 클릭 캡처: 거래처분류/안내분류/1~7차연장
  // ---------------------------------------------------------------------------
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

    const OPEN_THRESHOLD_PX = 10;

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

  const extDownRef = useRef<{
    pending: boolean;
    startX: number;
    startY: number;
    rowId: number;
    colKey: ExtKey;
    cellValue: string;
  } | null>(null);

   function findPartnerCellInfoFromTarget(t: HTMLElement | null) {
    const td = t?.closest("td[data-col-key]") as HTMLElement | null;
    if (!td) return null;

    const colKey = String(td.dataset?.colKey ?? "");
    if (colKey !== "거래처분류") return null;

    const tr = td.closest("tr[data-unified-id]") as HTMLElement | null;
    if (!tr) return null;

    const unifiedId = Number(tr.dataset?.unifiedId ?? 0);
    if (!Number.isFinite(unifiedId) || unifiedId <= 0) return null;

    const input = td.querySelector("input,select,textarea") as
      | HTMLInputElement
      | HTMLSelectElement
      | HTMLTextAreaElement
      | null;

    const currentValue = normalizeName(input?.value ?? td.textContent ?? "");
    return { unifiedId, currentValue };
  }

  function findGuideCellInfoFromTarget(t: HTMLElement | null) {
    const td = t?.closest("td[data-col-key]") as HTMLElement | null;
    if (!td) return null;

    const colKey = String(td.dataset?.colKey ?? "");
    if (colKey !== "안내분류") return null;

    const tr = td.closest("tr[data-unified-id]") as HTMLElement | null;
    const partnerTd = tr?.querySelector('td[data-col-key="거래처분류"]') as HTMLElement | null;

    const input = partnerTd?.querySelector("input,select,textarea") as
      | HTMLInputElement
      | HTMLSelectElement
      | HTMLTextAreaElement
      | null;

    const partnerName = normalizeName(input?.value ?? partnerTd?.textContent ?? "");
    return { partnerName };
  }

  function findExtCellInfoFromTarget(t: HTMLElement | null) {
    const td = t?.closest("td[data-col-key]") as HTMLElement | null;
    if (!td) return null;

    const colKeyRaw = String(td.dataset?.colKey ?? "");
    if (!EXT_KEYS.includes(colKeyRaw as ExtKey)) return null;

    const tr = td.closest("tr[data-unified-id]") as HTMLElement | null;
    if (!tr) return null;

    const rowId = Number(tr.dataset?.unifiedId ?? 0);
    if (!Number.isFinite(rowId) || rowId <= 0) return null;

    const input = td.querySelector("input,select,textarea") as
      | HTMLInputElement
      | HTMLSelectElement
      | HTMLTextAreaElement
      | null;

    const cellValue = normalizeName(input?.value ?? td.textContent ?? "");
    return { rowId, colKey: colKeyRaw as ExtKey, cellValue };
  }

  function onGridMouseDownCapture(e: React.MouseEvent) {
    if (isColumnEditMode) return;
    if (e.button !== 0) return;

    const t = e.target as HTMLElement | null;

    const partnerInfo = findPartnerCellInfoFromTarget(t);
    if (partnerInfo) {
      // ✅ 거래처분류 셀은 클릭/드래그를 mouseup/move로 구분한다.
      //    mousedown 단계에서 막지 않아야 셀 영역 선택이 정상 동작한다.
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
      guideDownRef.current = {
        pending: true,
        startX: e.clientX,
        startY: e.clientY,
        partnerName: guideInfo.partnerName,
      };
      return;
    }

    const extInfo = findExtCellInfoFromTarget(t);
    if (extInfo) {
      extDownRef.current = {
        pending: true,
        startX: e.clientX,
        startY: e.clientY,
        rowId: extInfo.rowId,
        colKey: extInfo.colKey,
        cellValue: extInfo.cellValue,
      };
      return;
    }
  }

  function onGridMouseMoveCapture(e: React.MouseEvent) {
    const st1 = partnerDownRef.current;
    if (st1?.pending) {
      const dx = Math.abs(e.clientX - st1.startX);
      const dy = Math.abs(e.clientY - st1.startY);

      // ✅ 일정 거리 이상 움직였을 때만 "클릭"이 아니라 "드래그"로 판정
      //    여기서는 이벤트를 막지 말고, popup 오픈 후보만 취소한다.
      if (dx >= OPEN_THRESHOLD_PX || dy >= OPEN_THRESHOLD_PX) {
        partnerDownRef.current = null;
      }
    }

    const st2 = guideDownRef.current;
    if (st2?.pending) {
      const dx = Math.abs(e.clientX - st2.startX);
      const dy = Math.abs(e.clientY - st2.startY);
      if (dx >= OPEN_THRESHOLD_PX || dy >= OPEN_THRESHOLD_PX) guideDownRef.current = null;
    }

    const st3 = extDownRef.current;
    if (st3?.pending) {
      const dx = Math.abs(e.clientX - st3.startX);
      const dy = Math.abs(e.clientY - st3.startY);
      if (dx >= OPEN_THRESHOLD_PX || dy >= OPEN_THRESHOLD_PX) extDownRef.current = null;
    }
  }

  function onGridMouseUpCapture(e: React.MouseEvent) {
    const st1 = partnerDownRef.current;
    partnerDownRef.current = null;
    if (st1?.pending) {
      const ae = document.activeElement as HTMLElement | null;
      if (ae && typeof (ae as any).blur === "function") {
        try {
          (ae as any).blur();
        } catch {
          // ignore
        }
      }

      e.preventDefault();
      e.stopPropagation();

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
      const ae = document.activeElement as HTMLElement | null;
      if (ae && typeof (ae as any).blur === "function") {
        try {
          (ae as any).blur();
        } catch {
          // ignore
        }
      }

      e.preventDefault();
      e.stopPropagation();

      setGuidePanelInitialPartner(normalizeName(st2.partnerName));
      setIsPartnerGuideOpen(true);
      return;
    }

    const st3 = extDownRef.current;
    extDownRef.current = null;
    if (st3?.pending) {
      const ae = document.activeElement as HTMLElement | null;
      if (ae && typeof (ae as any).blur === "function") {
        try {
          (ae as any).blur();
        } catch {
          // ignore
        }
      }

      e.preventDefault();
      e.stopPropagation();

      setExtPanel({
        open: true,
        x: e.clientX,
        y: e.clientY,
        rowId: st3.rowId,
        colKey: st3.colKey,
        initialValue: st3.cellValue,
      });
      return;
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
        filterMode={filterMode}
        onToggleFilterMode={handleToggleFilterMode}
        onOpenSearch={openSearchPanel}
        searchActive={unifiedSearch.open}
        onOpenColor={openColor}
        onDownload={handleDownload}
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
          migrationModeEnabled={migrationMode.enabled}
          columnOrder={columnOrder}
          onColumnOrderChange={setColumnOrder}
          colWidthUnitByKey={colWidthUnitByKey}
          onColWidthUnitByKeyChange={setColWidthUnitByKey}
          filterMode={filterMode}
          filterState={effectiveFilterState}
          onFilterStateChange={setFilterState}
          sortState={effectiveSortState}
          onSortStateChange={setSortState}
          searchMatchedRowIds={searchHighlight.matchedRowIds}
          searchActiveRowId={searchHighlight.activeRowId}
          searchActiveColKey={searchHighlight.activeColKey}
          searchFocusVersion={searchFocusVersion}
        />
      </div>

      <UnifiedSearchPanel
        open={unifiedSearch.open}
        anchor={searchPanelAnchor}
        keyword={unifiedSearch.keyword}
        loading={unifiedSearch.loading}
        currentIndex={unifiedSearch.currentIndex}
        total={unifiedSearch.total}
        returnedCount={unifiedSearch.returnedCount}
        truncated={unifiedSearch.truncated}
        error={unifiedSearch.error}
        onKeywordChange={unifiedSearch.setKeyword}
        onSearch={handleSearchSubmit}
        onNext={handleSearchNext}
        onClose={handleSearchClose}
      />

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

      <ExtensionEditPanel
        open={extPanel.open}
        title={extPanel.colKey ? `${extPanel.colKey} 입력` : "연장 입력"}
        x={extPanel.x}
        y={extPanel.y}
        initialValue={extPanel.initialValue}
        paymentOptions={paymentOptions}
        onClose={() => setExtPanel((p) => ({ ...p, open: false, rowId: null, colKey: "" }))}
        onSave={async (nextCellText: string, _fields: ExtensionCellFields) => {
          const rowId = extPanel.rowId;
          const colKey = extPanel.colKey;
          if (!rowId || !colKey) return;

          // 1) 해당 차수 셀 저장(비우기면 "" -> syncPatch에서 null 저장)
          await syncPatch(rowId, colKey, nextCellText);

          // 2) ✅ 종료일 = 시작일 + (0차연장 + 1차~15차 연장일수 합)
          //    항상 “시작일/연장값 전체” 기준으로 재계산해서 저장(증감 롤백 방식 제거)
          const r = await fetch(`/api/unified/${rowId}`, { cache: "no-store" });
          if (!r.ok) return;

          const j = await r.json().catch(() => null);
          const data = (j?.data ?? {}) as Record<string, any>;

          const startDateRaw = String(data?.["시작일"] ?? "");
          const totalDays = sumExtensionDaysFromRow(data);
          const nextEnd = computeEndDateFromStartAndTotalDays(startDateRaw, totalDays);

          if (nextEnd) {
            await syncPatch(rowId, "종료일", nextEnd);
          }
        }}
      />

      <ColorPopover
        open={colorOpen}
        anchor={colorAnchor}
        onClose={() => setColorOpen(false)}
        onApply={applyColor}
      />
    </div>
  );
}