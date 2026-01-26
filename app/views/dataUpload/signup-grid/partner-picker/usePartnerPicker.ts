"use client";

import { useMemo, useRef, useState } from "react";

function normalizeName(v: any) {
  return String(v ?? "").trim();
}

function sortKorean(a: string, b: string) {
  return String(a).localeCompare(String(b), "ko");
}

export function usePartnerPicker(params: {
  options: string[];
  value: string;
  onSelect: (name: string) => void;

  // DB 저장은 상위에서 맡기거나(onAdd/onDelete),
  // 없으면 여기서 fallback으로 직접 /api/signup-settings PATCH를 호출할 수도 있음(기본은 상위 주입 권장).
  onAdd?: (name: string) => void | Promise<void>;
  onDelete?: (name: string) => void | Promise<void>;
}) {
  const { options, value, onSelect, onAdd, onDelete } = params;

  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const openingRef = useRef(false);

  const normalizedOptions = useMemo(() => {
    const base = Array.isArray(options) ? options.map(normalizeName).filter(Boolean) : [];
    const cur = normalizeName(value);
    const merged = cur ? Array.from(new Set([cur, ...base])) : Array.from(new Set(base));
    merged.sort(sortKorean);
    return merged;
  }, [options, value]);

  function openAt(clientX: number, clientY: number) {
    // 연속 클릭/포커스 이벤트로 open이 여러 번 꼬이는 걸 방지
    if (openingRef.current) return;
    openingRef.current = true;

    setPos({ x: clientX, y: clientY });
    setOpen(true);

    setTimeout(() => {
      openingRef.current = false;
    }, 0);
  }

  function close() {
    setOpen(false);
  }

  async function add(name: string) {
    if (!onAdd) return;
    await onAdd(name);
  }

  async function remove(name: string) {
    if (!onDelete) return;
    await onDelete(name);
  }

  return {
    open,
    x: pos.x,
    y: pos.y,
    options: normalizedOptions,
    value: normalizeName(value),
    openAt,
    close,
    select: (name: string) => onSelect(normalizeName(name)),
    add,
    remove,
  };
}