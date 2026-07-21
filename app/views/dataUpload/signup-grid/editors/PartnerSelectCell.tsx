"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { syncEmitUnifiedUpdate } from "@/global-sync/sync-engine";
import PartnerPickerPopover from "@/views/dataUpload/signup-grid/partner-picker/PartnerPickerPopover";
import { apiGetSignupPartners, apiPatchSignupPartners } from "@/views/dataUpload/signup-partners/serviceSignupPartners";

function normalizeName(v: any) {
  return String(v ?? "").trim();
}

function sortKorean(a: string, b: string) {
  return String(a).localeCompare(String(b), "ko");
}

export default function PartnerSelectCell({
  value,
  onChange,
  onFocus,
  options,

  // CellEditor에서 내려주는 prop(타입 호환 유지용). 이 컴포넌트는 사용하지 않아도 됨.
  onAddPartnerOption,
}: {
  value: string;
  onChange: (v: string) => void;
  onFocus: () => void;

  // SignupView 단일 state가 내려주는 목록(신규가입 전용)
  options: string[];

  onAddPartnerOption?: (name: string) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // ✅ “즉시 반영”을 위해 로컬 옵션도 유지(부모가 syncListen으로 곧 갱신되지만, 체감용)
  const [localOptions, setLocalOptions] = useState<string[]>([]);
  const localOptionsRef = useRef<string[]>([]);
  useEffect(() => {
    localOptionsRef.current = localOptions;
  }, [localOptions]);

  // 부모 옵션이 바뀌면 로컬도 동기화(단, 중복/정렬 정리)
  useEffect(() => {
    const merged = Array.from(new Set((options || []).map(normalizeName).filter(Boolean)));
    merged.sort(sortKorean);
    setLocalOptions(merged);
  }, [options]);

  // 팝오버 오픈 시점에 한 번 서버 최신으로 당겨오기(동일 탭 내 다른 셀/다른 탭 변경 반영)
  async function refreshFromServer() {
    try {
      const j = await apiGetSignupPartners();
      const merged = Array.from(new Set((j.partnerOptions || []).map(normalizeName).filter(Boolean)));
      merged.sort(sortKorean);
      setLocalOptions(merged);
    } catch {
      // ignore
    }
  }

  const mergedOptions = useMemo(() => {
    const base = Array.isArray(localOptions) ? localOptions : [];
    const cur = normalizeName(value);

    // 현재 값이 목록에 없으면 임시 포함(선택 유지)
    const merged = cur ? Array.from(new Set([cur, ...base])) : Array.from(new Set(base));
    const cleaned = merged.map(normalizeName).filter(Boolean);
    cleaned.sort(sortKorean);
    return cleaned;
  }, [localOptions, value]);

  function openPopoverAt(e: React.MouseEvent) {
    onFocus();
    setPos({ x: e.clientX, y: e.clientY });
    setOpen(true);
    void refreshFromServer();
  }

  return (
    <>
      {/* 셀 표시(클릭 시 팝오버 오픈) */}
      <div
        className={[
          "w-full h-[26px] px-2 py-0.5 text-[12px] font-normal text-slate-500",
          "flex items-center justify-center",
          "bg-transparent",
          "cursor-pointer select-none",
        ].join(" ")}
        tabIndex={0}
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          onFocus();
        }}
        onClick={(e) => {
          openPopoverAt(e);
        }}
               onKeyDown={(e) => {
          // ✅ Delete/Backspace: 거래처분류 값 즉시 삭제
          if (e.key === "Delete" || e.key === "Backspace") {
            e.preventDefault();
            e.stopPropagation();
            onFocus();
            onChange("");
            setOpen(false);
            return;
          }

          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            setPos({ x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.bottom) });
            setOpen(true);
            void refreshFromServer();
            return;
          }

          if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
            return;
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
        options={mergedOptions}
        value={String(value ?? "")}
        onSelect={(name) => {
          // 선택은 셀 값만 변경
          onChange(normalizeName(name));
        }}
        onClose={() => setOpen(false)}
        onAdd={async (name) => {
          const n = normalizeName(name);
          if (!n) return;

          // 1) 셀 값 즉시 반영
          onChange(n);

          // 2) 신규가입 전용 거래처 목록 DB 저장(/api/signup-partners)
          const saved = await apiPatchSignupPartners({ add: n });
          const merged = Array.from(new Set((saved.partnerOptions || []).map(normalizeName).filter(Boolean)));
          merged.sort(sortKorean);
          setLocalOptions(merged);

          // 3) 다른 탭/같은 탭(SignupView syncListen)에도 즉시 반영되게 emit
          syncEmitUnifiedUpdate();

          // 4) (호환용) 상위 콜백이 있으면 best-effort 호출(의존하지는 않음)
          try {
            await onAddPartnerOption?.(n);
          } catch {
            // ignore
          }
        }}
        onDelete={async (name) => {
          const n = normalizeName(name);
          if (!n) return;

          // 1) DB에서 삭제
          const saved = await apiPatchSignupPartners({ remove: n });
          const merged = Array.from(new Set((saved.partnerOptions || []).map(normalizeName).filter(Boolean)));
          merged.sort(sortKorean);
          setLocalOptions(merged);

          // 2) 삭제된 값이 현재 셀 값이면 비우기
          if (normalizeName(value) === n) onChange("");

          // 3) 다른 탭/같은 탭(SignupView syncListen)에도 즉시 반영
          syncEmitUnifiedUpdate();
        }}
      />
    </>
  );
}