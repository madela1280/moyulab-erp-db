"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { syncEmitUnifiedUpdate } from "@/global-sync/sync-engine";
import {
  addPartnerOptionViaApi,
  fetchPartnerOptionsFromApi,
  normalizePartnerName,
  normalizePartnerOptions,
  savePartnerOptionsToApi,
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

  options: string[];
  onAddPartnerOption?: (name: string) => void | Promise<void>;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const popupInputRef = useRef<HTMLInputElement | null>(null);

  const [open, setOpen] = useState(false);

  const [remoteOptions, setRemoteOptions] = useState<string[]>([]);
  const [optimisticAdded, setOptimisticAdded] = useState<string[]>([]);
  const [optimisticRemoved, setOptimisticRemoved] = useState<Set<string>>(() => new Set());

  const [draftText, setDraftText] = useState<string>(String(value ?? ""));

  // options prop이 없거나 비어있으면 원격 로드
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

  // 열려있지 않을 때만 외부 value를 draftText로 반영
  useEffect(() => {
    if (open) return;
    setDraftText(String(value ?? ""));
  }, [value, open]);

  // 바깥 클릭/터치 시 닫기 (mousedown 대신 pointerdown으로 통일)
  useEffect(() => {
    if (!open) return;

    const onDown = (e: PointerEvent) => {
      const root = rootRef.current;
      if (!root) return;
      const t = e.target as Node | null;
      if (!t) return;
      if (root.contains(t)) return;
      setOpen(false);
    };

    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  const baseOptions = useMemo(() => {
    const src = Array.isArray(options) && options.length > 0 ? options : remoteOptions;
    return normalizePartnerOptions(src);
  }, [options, remoteOptions]);

  const visibleOptions = useMemo(() => {
    const removed = optimisticRemoved;
    const combined = normalizePartnerOptions([...baseOptions, ...optimisticAdded]).filter((x) => !removed.has(x));
    return combined;
  }, [baseOptions, optimisticAdded, optimisticRemoved]);

  const filteredOptions = useMemo(() => {
    // 사진처럼: 입력칸은 필터 역할도 겸함(입력 중이면 포함 검색)
    const q = normalizePartnerName(draftText).toLowerCase();
    if (!q) return visibleOptions;
    return visibleOptions.filter((o) => String(o).toLowerCase().includes(q));
  }, [visibleOptions, draftText]);

  async function handleAddPartner() {
    const name = window.prompt("신규 거래처를 입력해 주세요.");
    const n = normalizePartnerName(name);
    if (!n) return;

    // UI 즉시 반영
    setOptimisticAdded((prev) => (prev.includes(n) ? prev : [...prev, n]));
    setOptimisticRemoved((prev) => {
      if (!prev.has(n)) return prev;
      const next = new Set(prev);
      next.delete(n);
      return next;
    });

    try {
      if (onAddPartnerOption) {
        await onAddPartnerOption(n);
      } else {
        const saved = await addPartnerOptionViaApi(n);
        setRemoteOptions(saved);
      }

      // 추가 후: 값도 그걸로 선택
      onChange(n);
      setDraftText(n);

      syncEmitUnifiedUpdate();
    } catch {
      // ignore
    }
  }

  async function handleDeletePartner(name: string) {
    const n = normalizePartnerName(name);
    if (!n) return;

    const ok = window.confirm(`거래처 "${n}" 를 삭제할까요?`);
    if (!ok) return;

    // UI 즉시 반영
    setOptimisticRemoved((prev) => {
      if (prev.has(n)) return prev;
      const next = new Set(prev);
      next.add(n);
      return next;
    });

    try {
      // signup_settings.partnerOptions 배열에서 삭제 후 저장
      const nextList = visibleOptions.filter((x) => x !== n);
      const saved = await savePartnerOptionsToApi(nextList);
      setRemoteOptions(saved);

      // 현재 셀 값이 삭제된 항목이면 비움
      if (normalizePartnerName(value) === n) {
        onChange("");
        setDraftText("");
      }

      syncEmitUnifiedUpdate();
    } catch {
      // ignore
    }
  }

  function openPopup() {
    setOpen(true);
    requestAnimationFrame(() => {
      try {
        popupInputRef.current?.focus();
        popupInputRef.current?.select();
      } catch {}
    });
  }

  return (
    <div ref={rootRef} className="w-full h-[26px] relative">
      {/* ✅ 셀 "쉘"은 input으로 둬서 Grid의 pointerdown 로직에서 interactive로 인식되게 함(클릭 불가 문제 방지) */}
      <input
        readOnly
        className="w-full h-[26px] px-2 py-0.5 outline-none bg-transparent text-[12px] font-normal text-slate-500 text-center cursor-pointer"
        value={String(value ?? "")}
        onFocus={onFocus}
        onPointerDown={(e) => {
          // 셀 선택/드래그 흐름은 Grid가 처리. 여기서는 팝업만 연다.
          // readOnly input이라도 포커스는 필요.
          try {
            (e.currentTarget as HTMLInputElement).focus();
          } catch {}
          openPopup();
        }}
      />

      {open && (
        <div
          className="absolute left-0 top-[26px] z-[90] w-[220px] bg-white border rounded shadow-md overflow-hidden"
          onPointerDown={(e) => {
            // 팝업 내부 조작이 window pointerdown(바깥클릭)으로 닫히지 않게
            e.stopPropagation();
          }}
        >
          {/* 1) 첫번째 칸: 직접 입력 가능 */}
          <div className="p-2 border-b">
            <input
              ref={popupInputRef}
              className="w-full border rounded px-2 py-1 text-xs outline-none"
              placeholder="거래처 입력..."
              value={draftText}
              onChange={(e) => {
                const v = e.target.value;
                setDraftText(v);
                onChange(v); // 직접입력은 즉시 셀 값 반영
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                setOpen(false);
              }}
            />
          </div>

          {/* 2) 등록된 거래처 목록 */}
          <div className="max-h-[220px] overflow-auto">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-[11px] text-slate-500">등록된 거래처가 없습니다.</div>
            ) : (
              filteredOptions.map((o) => (
                <div key={o} className="flex items-stretch border-b last:border-b-0">
                  <button
                    type="button"
                    className="flex-1 text-left px-3 py-2 text-xs hover:bg-slate-50"
                    onClick={() => {
                      const n = normalizePartnerName(o);
                      onChange(n);
                      setDraftText(n);
                      setOpen(false);
                    }}
                  >
                    {o}
                  </button>
                  <button
                    type="button"
                    className="w-10 text-[11px] border-l hover:bg-red-50 text-red-600"
                    onClick={() => void handleDeletePartner(o)}
                    title="삭제"
                  >
                    삭제
                  </button>
                </div>
              ))
            )}
          </div>

          {/* 3) 신규거래처 추가 */}
          <button
            type="button"
            className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50"
            onClick={() => void handleAddPartner()}
          >
            신규거래처 추가
          </button>
        </div>
      )}
    </div>
  );
}