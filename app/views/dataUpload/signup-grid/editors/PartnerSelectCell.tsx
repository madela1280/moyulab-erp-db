"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  addPartnerOptionViaApi,
  fetchPartnerOptionsFromApi,
  mergePartnerOptionsWithValue,
  normalizePartnerName,
  normalizePartnerOptions,
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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [open, setOpen] = useState(false);

  const [remoteOptions, setRemoteOptions] = useState<string[]>([]);
  const [optimisticAdded, setOptimisticAdded] = useState<string[]>([]);
  const [draftText, setDraftText] = useState<string>(String(value ?? ""));

  useEffect(() => {
    if (Array.isArray(options) && options.length > 0) return;

    let mounted = true;
    (async () => {
      try {
        const list = await fetchPartnerOptionsFromApi();
        if (!mounted) return;
        setRemoteOptions(list);
      } catch {
        // ignore
      }
    })();

    return () => {
      mounted = false;
    };
  }, [options]);

  // 외부에서 value가 바뀌면 draftText도 동기화(단, 열려있을 땐 사용자가 편집중일 수 있으니 덮지 않음)
  useEffect(() => {
    if (open) return;
    setDraftText(String(value ?? ""));
  }, [value, open]);

  // 바깥 클릭 시 닫기
  useEffect(() => {
    if (!open) return;

    const onDown = (e: MouseEvent) => {
      const root = rootRef.current;
      if (!root) return;
      const t = e.target as Node | null;
      if (!t) return;
      if (root.contains(t)) return;
      setOpen(false);
    };

    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const baseOptions = options.length > 0 ? options : remoteOptions;

  const mergedOptions = useMemo(() => {
    const combined = [...baseOptions, ...optimisticAdded];
    return mergePartnerOptionsWithValue(combined, value);
  }, [baseOptions, optimisticAdded, value]);

  const normalizedBaseSet = useMemo(() => new Set(normalizePartnerOptions(baseOptions)), [baseOptions]);

  async function persistIfNew(nameRaw: string) {
    const n = normalizePartnerName(nameRaw);
    if (!n) return;

    // 이미 있으면 저장(추가) 불필요
    if (normalizedBaseSet.has(n)) return;

    // optimistic 반영
    setOptimisticAdded((prev) => (prev.includes(n) ? prev : [...prev, n]));

    try {
      if (onAddPartnerOption) {
        await onAddPartnerOption(n);
      } else {
        const saved = await addPartnerOptionViaApi(n);
        setRemoteOptions(saved);
      }
    } catch {
      // ignore (UI 흐름은 유지)
    }
  }

  async function commitDraftAndClose() {
    const next = normalizePartnerName(draftText);
    onChange(next);
    await persistIfNew(next);
    setOpen(false);
  }

  function pickOption(opt: string) {
    const next = normalizePartnerName(opt);
    onChange(next);
    setDraftText(next);
    setOpen(false);
  }

  const filteredOptions = useMemo(() => {
    const q = normalizePartnerName(draftText).toLowerCase();
    if (!q) return mergedOptions;
    return mergedOptions.filter((o) => String(o).toLowerCase().includes(q));
  }, [mergedOptions, draftText]);

  return (
    <div ref={rootRef} className="w-full h-[26px] relative">
      {/* 표시/클릭 영역: 기존처럼 "목록에서 선택" UX를 유지하면서, 클릭하면 패널을 띄움 */}
      <button
        type="button"
        className={[
          "w-full h-[26px] px-2",
          "text-[12px] font-normal text-slate-500 text-center",
          "bg-transparent",
          "outline-none",
        ].join(" ")}
        onFocus={() => {
          onFocus();
        }}
        onMouseDown={(e) => {
          // 셀 드래그/선택 흐름을 깨지 않게 mousedown에서 열기
          e.preventDefault();
          setOpen(true);

          // 패널 열릴 때 입력칸에 포커스
          requestAnimationFrame(() => {
            try {
              inputRef.current?.focus();
              inputRef.current?.select();
            } catch {}
          });
        }}
      >
        {String(value ?? "")}
      </button>

      {open && (
        <div
          className="absolute left-0 top-[26px] z-[90] w-[260px] bg-white border rounded shadow-md"
          onMouseDown={(e) => {
            // 패널 내부 클릭이 "바깥 클릭"으로 처리되지 않게
            e.stopPropagation();
          }}
        >
          {/* 1) 거래처 입력하는 곳 (직접입력) */}
          <div className="p-2 border-b">
            <input
              ref={inputRef}
              className="w-full border rounded px-2 py-1 text-xs outline-none"
              placeholder="거래처 입력..."
              value={draftText}
              onChange={(e) => {
                const v = e.target.value;
                setDraftText(v);
                onChange(v); // 셀 값은 즉시 반영(기존 그리드 입력 흐름 유지)
              }}
              onKeyDown={async (e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                await commitDraftAndClose();
              }}
              onBlur={() => {
                // blur만으로 닫지 않음(목록 클릭 시 blur 발생 가능)
                // 바깥 클릭은 window mousedown에서 닫힘 처리
              }}
            />

            {/* 3) 신규거래처 입력(확정/저장) */}
            <div className="mt-2 flex items-center justify-end">
              <button
                type="button"
                className="text-[11px] px-2 py-1 border rounded bg-white hover:bg-slate-50"
                onClick={async () => {
                  await commitDraftAndClose();
                }}
              >
                신규거래처 입력
              </button>
            </div>
          </div>

          {/* 2) 분류된 거래처 리스트(선택) */}
          <div className="max-h-[220px] overflow-auto py-1">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-[11px] text-slate-500">검색 결과가 없습니다.</div>
            ) : (
              filteredOptions.map((o) => (
                <button
                  key={o}
                  type="button"
                  className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50"
                  onClick={() => pickOption(o)}
                >
                  {o}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}