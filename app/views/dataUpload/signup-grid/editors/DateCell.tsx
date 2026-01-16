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

  const [text, setText] = useState<string>("");

  const iso = useMemo(() => toIsoIfPossible(value), [value]);
  const isCompleteIso = useMemo(() => /^\d{4}-\d{2}-\d{2}$/.test(iso), [iso]);

  useEffect(() => {
    setText(iso || "");
  }, [iso]);

  function openPicker() {
    const el = dateInputRef.current;
    if (!el) return;
    try {
      el.showPicker?.();
    } catch {}
    el.focus();
    el.click();
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
        onFocus={onFocus}
        onMouseDown={(e) => {
          // 오른쪽 아이콘 영역 클릭 시 달력 열기(버튼을 두지 않아 드래그 선택/포인터 흐름을 깨지 않음)
          if (isCompleteIso) return;
          const rect = (e.currentTarget as HTMLInputElement).getBoundingClientRect();
          const hitFromRight = rect.right - e.clientX;
          if (hitFromRight >= 0 && hitFromRight <= 26) {
            e.preventDefault();
            openPicker();
          }
        }}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);

          const maybeIso = toIsoIfPossible(raw);
          if (/^\d{4}-\d{2}-\d{2}$/.test(maybeIso)) {
            setText(maybeIso);
            onChange(maybeIso);
            return;
          }

          // 완전한 날짜가 아니면 일단 원문 저장(입력 흐름 유지)
          onChange(raw);
        }}
        onBlur={() => {
          const normalized = toIsoIfPossible(text);
          if (normalized !== text) setText(normalized);
          if (normalized !== value) onChange(normalized);
        }}
      />

      {/* 달력 아이콘: 날짜가 완성되면 숨김 */}
      {!isCompleteIso && (
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
        value={isCompleteIso ? iso : ""}
        onChange={(e) => {
          const v = e.target.value; // YYYY-MM-DD
          setText(v);
          onChange(v);
        }}
      />
    </div>
  );
}