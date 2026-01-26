"use client";

import { useEffect, useMemo, useState } from "react";
import { syncEmitUnifiedUpdate } from "@/global-sync/sync-engine";
import PartnerPickerPopover from "@/views/dataUpload/signup-grid/partner-picker/PartnerPickerPopover";
import { usePartnerPicker } from "@/views/dataUpload/signup-grid/partner-picker/usePartnerPicker";
import {
  addPartnerOptionViaApi,
  fetchPartnerOptionsFromApi,
  mergePartnerOptionsWithValue,
  normalizePartnerName,
  removePartnerOptionViaApi,
} from "@/views/dataUpload/signup-grid/editors/partnerOptions";

export default function PartnerSelectCell({
  value,
  onChange,
  onFocus,
  options,
  onAddPartnerOption,
}: {
  value: string;
  onChange: (v: string) => void;
  onFocus: () => void;

  // 상위에서 내려주면 사용(없으면 내부에서 /api 로드로 보완)
  options: string[];

  // 상위에서 DB/API 저장을 맡길 수도 있음(없으면 내부에서 /api/signup-settings로 저장)
  onAddPartnerOption?: (name: string) => void | Promise<void>;
}) {
  const [remoteOptions, setRemoteOptions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // ✅ 항상 DB의 최신 옵션을 한 번 불러와서(remoteOptions) "삭제/추가" 동작이
  // 상위 상태(옵션 prop)가 늦게 반영되어도 UI/저장에 꼬이지 않게 한다.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await fetchPartnerOptionsFromApi();
        if (!mounted) return;
        setRemoteOptions(Array.isArray(list) ? list : []);
      } catch {
        // ignore
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // ✅ UI 표시는 remoteOptions(=DB 최신) 우선, 없으면 상위 options 사용
  const baseOptions = remoteOptions.length > 0 ? remoteOptions : options;

  const mergedOptions = useMemo(() => {
    return mergePartnerOptionsWithValue(baseOptions, value);
  }, [baseOptions, value]);

  // hook은 상태 정리 용도로만 사용(필수는 아니지만 구조 분리 목적)
  const picker = usePartnerPicker({
    options: mergedOptions,
    value: String(value ?? ""),
    onSelect: (name) => {
      onChange(String(name ?? ""));
    },
    onAdd: async (name) => {
      const n = normalizePartnerName(name);
      if (!n) return;

      // 1) 상위에서 맡기면 상위 로직 사용(=settings 저장 포함)
      if (onAddPartnerOption) {
        await onAddPartnerOption(n);
        setRemoteOptions((prev) => Array.from(new Set([...(prev || []), n])));
        // 다른 탭/같은 탭 settings reload 유도
        syncEmitUnifiedUpdate();
        return;
      }

      // 2) 없으면 내부에서 API로 저장
      const saved = await addPartnerOptionViaApi(n);
      setRemoteOptions(Array.isArray(saved) ? saved : []);
      syncEmitUnifiedUpdate();
    },
    onDelete: async (name) => {
      const n = normalizePartnerName(name);
      if (!n) return;

      const saved = await removePartnerOptionViaApi(n);
      setRemoteOptions(Array.isArray(saved) ? saved : []);

      // 현재 값이 삭제된 값이면 비우기
      if (normalizePartnerName(value) === n) {
        onChange("");
      } else {
        onChange(String(value ?? ""));
      }

      // 다른 탭/같은 탭 settings reload 유도
      syncEmitUnifiedUpdate();
    },
  });

  function openPopoverAt(e: React.MouseEvent) {
    // grid selection 유지
    onFocus();

    // 기본 동작을 막을 필요는 없음(드래그는 SignupGrid에서 임계치로 처리)
    setPos({ x: e.clientX, y: e.clientY });
    setOpen(true);
  }

  return (
    <>
      {/* 셀 표시 영역(클릭 시 팝오버 오픈) */}
      <div
        className={[
          "w-full h-[26px] px-2 py-0.5 text-[12px] font-normal text-slate-500",
          "flex items-center justify-center",
          "bg-transparent",
          "cursor-pointer select-none",
        ].join(" ")}
        tabIndex={0}
        onMouseDown={(e) => {
          // 포커스/선택 먼저 확보
          // (우클릭 등은 상위에서 처리)
          if (e.button !== 0) return;
          onFocus();
        }}
        onClick={(e) => {
          openPopoverAt(e);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            // 키보드 오픈은 현재 요소 기준으로 위치 계산
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            setPos({ x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.bottom) });
            setOpen(true);
          }
        }}
        title={String(value ?? "")}
      >
        <span className="truncate w-full text-center">{String(value ?? "")}</span>
      </div>

      <PartnerPickerPopover
        open={open}
        x={pos.x}
        y={pos.y}
        options={picker.options}
        value={picker.value}
        onSelect={(name) => picker.select(name)}
        onClose={() => {
          setOpen(false);
          picker.close();
        }}
        onAdd={async (name) => {
          await picker.add(name);
          // 추가 후 현재 셀 값도 그 값으로 설정(요구 UX)
          const n = normalizePartnerName(name);
          if (n) onChange(n);
        }}
        onDelete={async (name) => {
          await picker.remove(name);
        }}
      />
    </>
  );
}