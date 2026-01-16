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

  // 표시용 텍스트(placeholder "연도-월-일"을 안 보이게 하려면 native date input을 직접 노출하지 않는 게 안전)
  const [text, setText] = useState<string>("");

  const iso = useMemo(() => toIsoIfPossible(value), [value]);

  useEffect(() => {
    // 외부 value 변경 시 표시 텍스트 동기화
    setText(iso || "");
  }, [iso]);

  return (
    <div className="w-full h-[26px] relative flex items-center">
      {/* 표시/직접 입력용 (YYYYMMDD 입력 시 자동 변환) */}
      <input
        type="text"
        inputMode="numeric"
        className="w-full h-[26px] px-2 pr-7 py-0.5 outline-none bg-transparent text-[12px] font-normal text-slate-500 text-center"
        value={text}
        placeholder=""
        onPointerDown={(e) => {
          // Grid 상위 포인터 캡처로 인해 date picker/입력이 막히는 케이스 방지
          e.stopPropagation();
        }}
        onFocus={onFocus}
        onChange={(e) => {
          const raw = e.target.value;
          // 사용자가 입력 중에는 그대로 보여주되, 8자리/분리자 포함 날짜는 ISO로 정규화 저장
          const maybeIso = toIsoIfPossible(raw);
          setText(raw);

          if (/^\d{4}-\d{2}-\d{2}$/.test(maybeIso)) {
            setText(maybeIso);
            onChange(maybeIso);
          } else {
            // 완전한 날짜가 아니면 일단 원문 저장(사용 흐름 유지)
            onChange(raw);
          }
        }}
        onBlur={() => {
          // 포커스 아웃 시 가능한 경우 ISO로 정리
          const normalized = toIsoIfPossible(text);
          if (normalized !== text) setText(normalized);
          if (normalized !== value) onChange(normalized);
        }}
      />

      {/* 달력 버튼(숨김 date input을 focus/click 해서 달력 열기) */}
      <button
        type="button"
        className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded hover:bg-slate-100"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => {
          const el = dateInputRef.current;
          if (!el) return;
          try {
            el.showPicker?.();
          } catch {}
          el.focus();
          el.click();
        }}
        aria-label="달력 열기"
      >
        {/* 간단한 달력 아이콘 */}
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M7 2v3M17 2v3" />
          <path d="M3 9h18" />
          <path d="M5 5h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
        </svg>
      </button>

      {/* 실제 달력 선택용(숨김) */}
      <input
        ref={dateInputRef}
        type="date"
        className="absolute inset-0 opacity-0 pointer-events-none"
        tabIndex={-1}
        value={/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : ""}
        onChange={(e) => {
          const v = e.target.value; // YYYY-MM-DD
          setText(v);
          onChange(v);
        }}
      />
    </div>
  );
}