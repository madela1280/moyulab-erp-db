"use client";

import { useEffect, useRef, useState } from "react";
import DateCell from "@/views/dataUpload/signup-grid/editors/DateCell";
import PartnerSelectCell from "@/views/dataUpload/signup-grid/editors/PartnerSelectCell";

const DATE_KEYS = new Set<string>(["택배발송일", "신청일", "시작일", "반납요청일", "반납완료일"]);

export default function CellEditor({
  columnKey,
  value,
  onChange,
  onFocus,
  partnerOptions = [],
  onAddPartnerOption,
}: {
  columnKey: string;
  value: string;
  onChange: (v: string) => void;
  onFocus: () => void;

  partnerOptions?: string[];
  onAddPartnerOption?: (name: string) => void | Promise<void>;
}) {
  if (columnKey === "거래처분류") {
    return (
      <PartnerSelectCell
        value={value}
        onChange={onChange}
        onFocus={onFocus}
        options={partnerOptions}
        onAddPartnerOption={onAddPartnerOption}
      />
    );
  }

  if (DATE_KEYS.has(columnKey)) {
    return <DateCell value={value} onChange={onChange} onFocus={onFocus} />;
  }

  // 계약자주소: 헤더는 기존대로(중앙) 유지, 셀 입력값만 좌측정렬
  const isAddress = columnKey === "계약자주소";

  /**
   * ✅ 입력 안정화 + "삭제 직후 행이 다시 생기는 현상" 방지 보강
   * - UI 표시는 localValue가 담당(입력 튕김 방지)
   * - 부모 반영(onChange)은 rAF로 1프레임 1회만 수행(과도 리렌더 감소)
   * - 언마운트 시 예약된 rAF를 취소(삭제/행삭제 직후 늦게 들어오는 setCell 방지에 도움)
   */
  const [localValue, setLocalValue] = useState<string>(String(value ?? ""));
  const focusedRef = useRef(false);

  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<string>(String(value ?? ""));
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  // 외부 value 변경은 "포커스 아닐 때만" 로컬 값에 반영 (입력 중 튕김 방지)
  useEffect(() => {
    const next = String(value ?? "");

    // ✅ 선택 지우기/붙여넣기 등 외부 동작으로 값이 ""로 바뀌면,
    // 포커스 중이어도 로컬값을 강제로 ""로 맞춰서 "지웠는데 다시 나타남" 방지
    if (focusedRef.current) {
      if (next === "" && pendingRef.current !== "") {
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        pendingRef.current = "";
        setLocalValue("");
      }
      return;
    }

    setLocalValue(next);
    pendingRef.current = next;
  }, [value]);

  function flushToParent(next: string) {
    if (!mountedRef.current) return;

    // 예약된 rAF 취소
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    pendingRef.current = next;
    onChange(next);
  }

  function scheduleToParent(next: string) {
    pendingRef.current = next;
    if (rafRef.current) return;

    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (!mountedRef.current) return;
      onChange(pendingRef.current);
    });
  }

  return (
    <input
      className={[
        "w-full h-[26px] px-2 py-0.5 outline-none bg-transparent text-[12px] font-normal text-slate-500",
        isAddress ? "text-left" : "text-center",
      ].join(" ")}
      value={localValue}
      onFocus={() => {
        focusedRef.current = true;
        onFocus();
      }}
      onChange={(e) => {
        const next = e.target.value;
        setLocalValue(next); // UI는 즉시 반영(안 튕김)
        scheduleToParent(next); // 부모 반영은 1프레임 1회
      }}
      onBlur={() => {
        focusedRef.current = false;
        // blur 시점에는 확정 반영(유실 방지)
        flushToParent(pendingRef.current);
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        // 엔터로도 확정(선택적으로)
        flushToParent(pendingRef.current);
      }}
    />
  );
}