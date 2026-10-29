"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import LotteShipmentGrid, {
  formatDateTime,
} from "@/views/lotteShipment/components/LotteShipmentGrid";
import { useLotteShipmentColumnConfig } from "@/views/lotteShipment/column-config/useLotteShipmentColumnConfig";
import {
  fetchLotteShipments,
  deleteLotteShipments,
  sendLotteShipmentsToUnified,
  sendLotteShipmentsToEcount,
  updateLotteShipmentProductName,
  updateLotteShipmentDeviceNo,
  type LotteShipmentRow,
} from "@/views/lotteShipment/service";
import FilterButton from "@/views/lotteShipment/filter/FilterButton";
import {
  applyLotteFilter,
  applyLotteSearch,
  createEmptyFilterState,
  getLotteFilterValueForColumn,
  isFilterActive,
  type ColumnFilterState,
} from "@/views/lotteShipment/filter/useLotteShipmentFilter";
import { syncEmitUnifiedUpdate } from "@/global-sync/sync-engine";

type SortState = { key: keyof LotteShipmentRow; dir: "asc" | "desc" } | null;

const AUTO_REFRESH_MS = 5000;

export default function LotteShipmentView() {
  const [rows, setRows] = useState<LotteShipmentRow[]>([]);
  const { columns, setColumns } = useLotteShipmentColumnConfig();
  const [isColumnEditMode, setIsColumnEditMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [scanSortActive, setScanSortActive] = useState(false);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState(false);
  const [filterState, setFilterState] = useState<ColumnFilterState>(createEmptyFilterState());
  const [sortState, setSortState] = useState<SortState>(null);

  // ✅ silent=true면 배경 자동 새로고침용 — 로딩 스피너를 안 띄우고, 선택해둔 체크박스도
  //    안 지운다(삭제/전송 중 선택이 갑자기 풀리지 않게). 삭제된 행이 있으면 선택에서만 뺀다.
  async function loadRows(opts: { silent?: boolean } = {}) {
    if (!opts.silent) setLoading(true);
    setError("");
    try {
      const nextRows = await fetchLotteShipments();
      setRows(nextRows);
      if (opts.silent) {
        setSelectedIds((prev) => {
          const validIds = new Set(nextRows.map((r) => r.운송장번호));
          return new Set(Array.from(prev).filter((id) => validIds.has(id)));
        });
      } else {
        setSelectedIds(new Set());
      }
    } catch (e: any) {
      if (!opts.silent) setError(e?.message || "롯데택배 목록을 불러오지 못했습니다.");
    } finally {
      if (!opts.silent) setLoading(false);
    }
  }

  useEffect(() => {
    loadRows();
  }, []);

  useEffect(() => {
    // ✅ 기기번호태그 앱이 보낸 값이 전송되는 즉시(몇 초 안에) 화면에 보이도록 자동 새로고침.
    const timer = setInterval(() => loadRows({ silent: true }), AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  const searchedRows = useMemo(() => applyLotteSearch(rows, searchQuery, formatDateTime), [rows, searchQuery]);
  const filteredRows = useMemo(
    () => applyLotteFilter(searchedRows, filterState, formatDateTime),
    [searchedRows, filterState]
  );

  const sortedRows = useMemo(() => {
    // 컬럼 필터 팝오버의 "텍스트 오름차순/내림차순 정렬"이 켜져 있으면 그게 우선.
    if (sortState) {
      const { key, dir } = sortState;
      const sorted = [...filteredRows].sort((a, b) =>
        getLotteFilterValueForColumn(key, a, formatDateTime).localeCompare(
          getLotteFilterValueForColumn(key, b, formatDateTime),
          "ko-KR"
        )
      );
      return dir === "desc" ? sorted.reverse() : sorted;
    }

    if (!scanSortActive) return filteredRows;
    // 스캔일시가 비어있는(미발송) 행을 위로, 그 안에서는 원래 순서 유지
    return [...filteredRows].sort((a, b) => {
      const av = a.스캔일시 ? 1 : 0;
      const bv = b.스캔일시 ? 1 : 0;
      return av - bv;
    });
  }, [filteredRows, scanSortActive, sortState]);

  // ✅ 화면을 보고 있는 중에 스캔/태그 등록으로 값이 바뀌어도(자동 새로고침) 행 순서가 갑자기
  //    안 바뀌게 고정해둔다 — 예를 들어 "미스캔 위로" 정렬 중에 스캔을 하면 그 즉시 해당 행이
  //    아래로 튀어서 기기번호를 확인하기 어려웠던 문제. 행이 새로 생기거나 없어질 때(검색/필터/
  //    정렬 기준이 바뀔 때 포함)만 순서를 다시 계산하고, 그 외에는 값만 갱신한다.
  const rowsById = useMemo(() => {
    const map = new Map<string, LotteShipmentRow>();
    for (const r of rows) map.set(r.운송장번호, r);
    return map;
  }, [rows]);

  // 순서를 다시 계산할 "이유"가 생겼을 때만의 키 — 행 구성(검색/필터로 걸러진 집합)이 바뀌었거나
  // 사용자가 직접 정렬 기준을 바꿨을 때만 바뀐다. 값만 조용히 갱신되는 건(자동 새로고침) 여기
  // 반영 안 됨 -> 순서 유지.
  const filteredIdsKey = useMemo(
    () => filteredRows.map((r) => r.운송장번호).slice().sort().join(","),
    [filteredRows]
  );
  const orderTriggerKey = `${filteredIdsKey}|${sortState ? `${sortState.key}:${sortState.dir}` : ""}|${scanSortActive}`;

  const [orderIds, setOrderIds] = useState<string[]>([]);
  const lastOrderTriggerRef = useRef<string>("");

  useEffect(() => {
    if (orderTriggerKey !== lastOrderTriggerRef.current) {
      lastOrderTriggerRef.current = orderTriggerKey;
      setOrderIds(sortedRows.map((r) => r.운송장번호));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderTriggerKey]);

  const displayRows = useMemo(
    () => orderIds.map((id) => rowsById.get(id)).filter((r): r is LotteShipmentRow => !!r),
    [orderIds, rowsById]
  );

  function handleToggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleToggleSelectAll(checked: boolean) {
    setSelectedIds(checked ? new Set(rows.map((row) => row.운송장번호)) : new Set());
  }

  async function handleDelete() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`선택한 ${selectedIds.size}건을 삭제하시겠습니까?`)) return;

    setError("");
    try {
      await deleteLotteShipments(Array.from(selectedIds));
      await loadRows();
    } catch (e: any) {
      setError(e?.message || "삭제하지 못했습니다.");
    }
  }

  async function handleSend() {
    if (selectedIds.size === 0) return;

    setError("");
    try {
      const result = await sendLotteShipmentsToUnified(Array.from(selectedIds));
      if (result.skippedInvoiceNos.length > 0) {
        window.alert(
          `전송 완료: ${result.sentCount}건\n매칭 실패(건너뜀): ${result.skippedInvoiceNos.length}건\n` +
            `(수취인명+전화번호가 통합관리와 정확히 일치하는 행이 없거나 여러 건인 경우입니다)`
        );
      }
      // ✅ 통합관리 DB는 서버에서 직접 갱신되고 소켓 emit이 없어서, 열려있는 통합관리 화면이
      //    새로고침 전까지 반영을 못 받던 문제 — 여기서 신호만 쏴준다(DB 쓰기는 이미 끝남).
      if (result.sentCount > 0) syncEmitUnifiedUpdate();
      await loadRows();
    } catch (e: any) {
      setError(e?.message || "전송하지 못했습니다.");
    }
  }

  // ✅ 서버 응답(왕복)을 기다리지 않고 화면에 바로 반영(낙관적 업데이트) — 수정 직후 반박자
  //    늦게 보이던 문제. 실패하면 silent reload로 서버 실제 값으로 되돌린다.
  async function handleUpdateProductName(invoiceNo: string, 상품명: string) {
    setError("");
    setRows((prev) => prev.map((r) => (r.운송장번호 === invoiceNo ? { ...r, 상품명 } : r)));
    try {
      await updateLotteShipmentProductName(invoiceNo, 상품명);
      await loadRows({ silent: true });
    } catch (e: any) {
      setError(e?.message || "상품명을 수정하지 못했습니다.");
      await loadRows({ silent: true });
    }
  }

  async function handleUpdateDeviceNo(invoiceNo: string, 기기번호: string) {
    setError("");
    setRows((prev) => prev.map((r) => (r.운송장번호 === invoiceNo ? { ...r, 기기번호 } : r)));
    try {
      await updateLotteShipmentDeviceNo(invoiceNo, 기기번호);
      await loadRows({ silent: true });
    } catch (e: any) {
      setError(e?.message || "기기번호를 수정하지 못했습니다.");
      await loadRows({ silent: true });
    }
  }

  async function handleSendEcount() {
    if (selectedIds.size === 0) return;

    setError("");
    try {
      const result = await sendLotteShipmentsToEcount(Array.from(selectedIds));
      if (result.skippedInvoiceNos.length > 0) {
        window.alert(
          `이카운트 전송 완료: ${result.sentCount}건\n보류: ${result.skippedInvoiceNos.length}건\n` +
            `(스캔 안 됐거나, 상품명이 이카운트 품목코드와 아직 매핑되지 않은 건입니다)`
        );
      }
      await loadRows();
    } catch (e: any) {
      setError(e?.message || "이카운트로 전송하지 못했습니다.");
    }
  }

  const unsentSelectedCount = Array.from(selectedIds).filter(
    (id) => rows.find((r) => r.운송장번호 === id)?.전송상태 === "미전송"
  ).length;

  const unsentEcountSelectedCount = Array.from(selectedIds).filter(
    (id) => rows.find((r) => r.운송장번호 === id)?.이카운트전송상태 !== "전송완료"
  ).length;

  return (
    <div className="w-full h-full flex flex-col p-3 gap-3 bg-white">
      <div className="flex items-center gap-2">
        <div className="text-base font-semibold text-slate-800">롯데택배</div>
        <button
          type="button"
          onClick={() => setSearchOpen((prev) => !prev)}
          className={`rounded border px-2 py-1 text-xs font-medium ${
            searchOpen ? "border-slate-300 bg-slate-300 text-slate-800" : "border-slate-200 bg-slate-100 text-slate-800 hover:bg-slate-200"
          }`}
        >
          검색
        </button>
        {searchOpen && (
          <input
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="운송장번호, 수하인명, 전화번호, 주소, 기기번호 등으로 검색"
            className="w-72 px-2 py-1.5 text-sm border border-slate-300 rounded"
          />
        )}
        <FilterButton
          active={filterMode || isFilterActive(filterState)}
          onClick={() => {
            setFilterMode((prev) => {
              const next = !prev;
              if (!next) setFilterState(createEmptyFilterState()); // 필터 버튼 다시 누르면 꺼지면서 필터도 해제
              return next;
            });
          }}
        />
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => loadRows()}
          disabled={loading}
          className="rounded border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-200 disabled:opacity-50"
        >
          새로고침
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={selectedIds.size === 0}
          className="rounded border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-200 disabled:opacity-50"
        >
          삭제 ({selectedIds.size})
        </button>
        <button
          type="button"
          onClick={handleSend}
          disabled={unsentSelectedCount === 0}
          className="px-3 py-1.5 rounded border border-blue-600 bg-blue-600 text-sm text-white font-semibold hover:bg-blue-700"
        >
          통합관리전송 ({unsentSelectedCount})
        </button>
        <button
          type="button"
          onClick={handleSendEcount}
          disabled={unsentEcountSelectedCount === 0}
          className="px-3 py-1.5 rounded border border-red-600 bg-red-600 text-sm text-black font-semibold hover:bg-red-700"
        >
          이카운트 전송 ({unsentEcountSelectedCount})
        </button>
        <button
          type="button"
          onClick={() => setIsColumnEditMode((prev) => !prev)}
          className={`rounded border px-2 py-1 text-xs font-medium ${
            isColumnEditMode ? "border-slate-300 bg-slate-300 text-slate-800" : "border-slate-200 bg-slate-100 text-slate-800 hover:bg-slate-200"
          }`}
        >
          열이동
        </button>
      </div>

      {error && <div className="text-xs text-red-600">{error}</div>}

      <LotteShipmentGrid
        rows={displayRows}
        columns={columns}
        isColumnEditMode={isColumnEditMode}
        onColumnsChange={setColumns}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
        onToggleSelectAll={handleToggleSelectAll}
        scanSortActive={scanSortActive}
        onToggleScanSort={() => setScanSortActive((prev) => !prev)}
        filterMode={filterMode}
        filterState={filterState}
        onFilterStateChange={setFilterState}
        allRowsForFilter={searchedRows}
        onSortChange={(key, dir) => setSortState({ key, dir })}
        onUpdateProductName={handleUpdateProductName}
        onUpdateDeviceNo={handleUpdateDeviceNo}
      />
    </div>
  );
}
