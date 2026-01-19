"use client";

import { useEffect, useMemo, useRef, useState } from "react";

function toIsoIfPossible(raw: string): string {
  const v = String(raw ?? "").trim();
  if (!v) return "";

  // already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;

  // 20260101 -> 2026-01-01
  if (/^\d{8}$/.test(v)) {
    const y = v.slice(0, 4);
    const m = v.slice(4, 6);
    const d = v.slice(6, 8);
    return `${y}-${m}-${d}`;
  }

  // remove separators then retry
  const digits = v.replace(/[^\d]/g, "");
  if (/^\d{8}$/.test(digits)) {
    const y = digits.slice(0, 4);
    const m = digits.slice(4, 6);
    const d = digits.slice(6, 8);
    return `${y}-${m}-${d}`;
  }

  return v;
}

function isCompleteIso(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "").trim());
}

export default function DateCell({
  value,
  onChange,
  onFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onFocus: () => void;
}) {
  const dateInputRef = useRef<HTMLInputElement | null>(null);

  // 사용자가 입력 중일 때(포커스 유지 중)에는 외부 value 변화로 text를 덮지 않음
  const editingRef = useRef(false);

  const [text, setText] = useState<string>("");

  const isoFromValue = useMemo(() => toIsoIfPossible(value), [value]);
  const normalizedText = useMemo(() => toIsoIfPossible(text), [text]);

  const showCalendarIcon = useMemo(() => {
    // 표시 기준은 "현재 입력(text)" 우선
    // (입력/변환이 완료되면 아이콘 숨김)
    return !isCompleteIso(normalizedText);
  }, [normalizedText]);

  // ✅ 외부에서 값이 바뀌었을 때만 동기화(입력 중에는 덮어쓰기 방지)
  useEffect(() => {
    if (editingRef.current) return;
    setText(isoFromValue || "");
  }, [isoFromValue]);

  function openPicker() {
    const el = dateInputRef.current;
    if (!el) return;

    try {
      el.showPicker?.();
    } catch {
      // ignore
    }

    try {
      el.focus();
      el.click();
    } catch {
      // ignore
    }
  }

  function commitNormalized(raw: string) {
    const normalized = toIsoIfPossible(raw);

    // 표시도 정규화로 맞춤
    setText(normalized);

    // 부모 값도 정규화로 확정
    if (normalized !== String(value ?? "")) {
      onChange(normalized);
    }
  }

  return (
    <div className="w-full h-[26px] relative flex items-center">
      {/* 표시/직접 입력용(YYYYMMDD 입력 → YYYY-MM-DD 자동 변환) */}
      <input
        type="text"
        inputMode="numeric"
        className="w-full h-[26px] px-2 pr-7 py-0.5 outline-none bg-transparent text-[12px] font-normal text-slate-500 text-center"
        value={text}
        placeholder=""
        onFocus={() => {
          editingRef.current = true;
          onFocus();
        }}
        onMouseDown={(e) => {
          // 오른쪽 아이콘 영역 클릭 시 달력 열기(아이콘이 보일 때만)
          if (!showCalendarIcon) return;

          const rect = (e.currentTarget as HTMLInputElement).getBoundingClientRect();
          const hitFromRight = rect.right - e.clientX;
          if (hitFromRight >= 0 && hitFromRight <= 26) {
            e.preventDefault();
            openPicker();
          }
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          commitNormalized((e.currentTarget as HTMLInputElement).value);
          try {
            (e.currentTarget as HTMLInputElement).blur();
          } catch {
            // ignore
          }
        }}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);

          // ✅ 입력 중에도 "완성된 날짜"는 즉시 ISO로 확정(불안정 케이스 방지)
          const normalized = toIsoIfPossible(raw);
          if (isCompleteIso(normalized)) {
            setText(normalized);
            onChange(normalized);
            return;
          }

          // 완전한 날짜가 아니면 원문 유지(입력 흐름 유지)
          onChange(raw);
        }}
        onBlur={(e) => {
          editingRef.current = false;
          commitNormalized(e.currentTarget.value);
        }}
      />

      {/* 달력 아이콘: 날짜가 완성되면 숨김(기존 동작 복구) */}
      {showCalendarIcon && (
        <div className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center pointer-events-none text-slate-600">
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M7 2v3M17 2v3" />
            <path d="M3 9h18" />
            <path d="M5 5h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
          </svg>
        </div>
      )}

      {/* 실제 달력 선택용(숨김) */}
      <input
        ref={dateInputRef}
        type="date"
        className="absolute inset-0 opacity-0 pointer-events-none"
        tabIndex={-1}
        value={isCompleteIso(isoFromValue) ? isoFromValue : ""}
        onChange={(e) => {
          const v = e.target.value; // YYYY-MM-DD
          setText(v);
          onChange(v);
        }}
      />
    </div>
  );
}