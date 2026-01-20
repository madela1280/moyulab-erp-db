"use client";

import { useState } from "react";
import SymphonyHeader from "@/devices/symphony/components/SymphonyHeader";
import SymphonyGrid from "@/devices/symphony/components/SymphonyGrid";
import { useSymphonyColumnConfig } from "@/devices/symphony/column-config/useSymphonyColumnConfig";
import { insertSymphonyRows } from "@/devices/symphony/service/serviceSymphony";

export default function SymphonyMain() {
  const [isColumnEditMode, setIsColumnEditMode] = useState(false);

  // Grid를 "remount" 시켜서 내부 useSymphonyRows()가 reload 되도록(기존 코어 건드리지 않음)
  const [gridMountKey, setGridMountKey] = useState(1);

  const {
    columnOrder,
    setColumnOrder,
    colWidthUnitByKey,
    setColWidthUnitByKey,
  } = useSymphonyColumnConfig();

  async function handleAdd10() {
    await insertSymphonyRows({ count: 10, beforeId: null, afterId: null });
    setGridMountKey((v) => v + 1);
  }

  return (
    <div className="w-full h-full flex flex-col">
      <div style={{ height: "0.3cm" }} />

      <SymphonyHeader
        onAdd10={handleAdd10}
        isColumnEditMode={isColumnEditMode}
        onToggleColumnEditMode={() => setIsColumnEditMode((v) => !v)}
        onAddTemplate={() => {
          // TODO: 양식추가(컬럼 추가) 모달 연결(기능 모듈로 분리해서 추가)
          alert("양식추가: 준비중");
        }}
        onOpenFilter={() => {
          // TODO: 필터 UI/로직(기능 모듈로 분리해서 추가)
          alert("필터: 준비중");
        }}
        onToggleColor={() => {
          // TODO: 칼라 UI/적용 로직(기능 모듈로 분리해서 추가)
          alert("칼라: 준비중");
        }}
        onDownload={() => {
          // TODO: 다운로드(기능 모듈로 분리해서 추가)
          alert("다운로드: 준비중");
        }}
      />

      <div className="flex-1 min-h-0">
        <SymphonyGrid
          key={gridMountKey}
          isColumnEditMode={isColumnEditMode}
          columnOrder={columnOrder}
          onColumnOrderChange={setColumnOrder}
          colWidthUnitByKey={colWidthUnitByKey}
          onColWidthUnitByKeyChange={setColWidthUnitByKey}
        />
      </div>
    </div>
  );
}