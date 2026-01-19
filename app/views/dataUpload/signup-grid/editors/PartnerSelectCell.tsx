"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { syncEmitUnifiedUpdate } from "@/global-sync/sync-engine";
import {
  addPartnerOptionViaApi,
  fetchPartnerOptionsFromApi,
  normalizePartnerName,
  normalizePartnerOptions,
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
  const rootRef = useRef<HTMLDivElement | null>(null);

  // select 모드 입력칸(직접입력)
  const selectInputRef = useRef<HTMLInputElement | null>(null);

  // manage 모드 입력칸(신규 추가)
  const manageInputRef = useRef<HTMLInputElement | null>(null);

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"select" | "manage">("select");

  const [remoteOptions, setRemoteOptions] = useState<string[]>([]);
  const [optimisticAdded, setOptimisticAdded] = useState<string[]>([]);
  const [optimisticRemoved, setOptimisticRemoved] = useState<Set<string>>(() => new Set());

  // select 모드: 직접입력 텍스트
  const [draftText, setDraftText] = useState<string>(String(value ?? ""));

  // manage 모드: 신규 거래처 입력 텍스트
  const [newName, setNewName] = useState<string>("");

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

  // 바깥 클릭 시 닫기
  useEffect(() => {
    if (!open) return;

    const onDown = (e: PointerEvent) => {
      const root = rootRef.current;
      if (!root) return;
      const t = e.target as Node | null;
      if (!t) return;
      if (root.contains(t)) return;

      setOpen(false);
      setMode("select");
      setNewName("");
    };

    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  // 팝업이 열릴 때 포커스
  useEffect(() => {
    if (!open) return;

    requestAnimationFrame(() => {
      try {
        if (mode === "select") {
          selectInputRef.current?.focus();
          selectInputRef.current?.select();
        } else {
          manageInputRef.current?.focus();
          manageInputRef.current?.select();
        }
      } catch {}
    });
  }, [open, mode]);

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
    // select 모드에서만 입력값으로 필터 (사진처럼 입력칸이 맨 위에 있고, 아래는 목록)
    const q = normalizePartnerName(draftText).toLowerCase();
    if (!q) return visibleOptions;
    return visibleOptions.filter((o) => String(o).toLowerCase().includes(q));
  }, [visibleOptions, draftText]);

  async function addPartner(nameRaw: string) {
    const n = normalizePartnerName(nameRaw);
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
      syncEmitUnifiedUpdate();
    } catch {
      // ignore
    }
  }

  async function deletePartner(nameRaw: string) {
    const n = normalizePartnerName(nameRaw);
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
      const saved = await removePartnerOptionViaApi(n);
      setRemoteOptions(saved);

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
    setMode("select");
    setNewName("");
  }

  function closePopup() {
    setOpen(false);
    setMode("select");
    setNewName("");
  }

  return (
    <div ref={rootRef} className="w-full h-[26px] relative">
      {/* 셀 쉘: Grid에서 interactive로 인식되도록 input 유지 */}
      <input
        readOnly
        className="w-full h-[26px] px-2 py-0.5 outline-none bg-transparent text-[12px] font-normal text-slate-500 text-center cursor-pointer"
        value={String(value ?? "")}
        onFocus={onFocus}
        onPointerDown={() => {
          // Grid가 셀 선택/드래그를 처리하고, 여기서는 팝업만 연다.
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
          {/* ---------------- select 모드 ---------------- */}
          {mode === "select" && (
            <>
              {/* 1) 첫번째 칸: 직접 입력 가능 */}
              <div className="p-2 border-b">
                <input
                  ref={selectInputRef}
                  className="w-full border rounded px-2 py-1 text-xs outline-none"
                  placeholder="거래처 입력..."
                  value={draftText}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDraftText(v);
                    onChange(v); // 직접입력 즉시 반영
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    closePopup();
                  }}
                />
              </div>

              {/* 2) 두번째 칸부터: 기존거래처(추가된 거래처들) */}
              <div className="max-h-[220px] overflow-auto">
                {filteredOptions.length === 0 ? (
                  <div className="px-3 py-2 text-[11px] text-slate-500">등록된 거래처가 없습니다.</div>
                ) : (
                  filteredOptions.map((o) => (
                    <button
                      key={o}
                      type="button"
                      className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 border-b last:border-b-0"
                      onClick={() => {
                        const n = normalizePartnerName(o);
                        onChange(n);
                        setDraftText(n);
                        closePopup(); // ✅ 기존거래처 클릭 후 입력창(팝업) 사라짐
                      }}
                    >
                      {o}
                    </button>
                  ))
                )}
              </div>

              {/* 신규거래처 추가(관리 모드로 진입: 여기에서 추가/삭제 모두) */}
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50"
                onClick={() => {
                  setMode("manage");
                  setNewName("");
                }}
              >
                신규거래처 추가
              </button>
            </>
          )}

          {/* ---------------- manage 모드(추가/삭제) ---------------- */}
          {mode === "manage" && (
            <>
              <div className="px-2 py-2 border-b flex items-center justify-between">
                <div className="text-[11px] font-semibold text-slate-700">거래처 관리</div>
                <button
                  type="button"
                  className="text-[11px] px-2 py-1 border rounded bg-white hover:bg-slate-50"
                  onClick={() => {
                    setMode("select");
                    setNewName("");
                  }}
                >
                  돌아가기
                </button>
              </div>

              {/* 신규 입력 + 추가 버튼 */}
              <div className="p-2 border-b">
                <div className="flex items-center gap-2">
                  <input
                    ref={manageInputRef}
                    className="flex-1 border rounded px-2 py-1 text-xs outline-none"
                    placeholder="신규 거래처 입력..."
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      const n = normalizePartnerName(newName);
                      if (!n) return;
                      await addPartner(n);
                      setNewName("");
                    }}
                  />
                  <button
                    type="button"
                    className="text-[11px] px-2 py-1 border rounded bg-white hover:bg-slate-50"
                    onClick={async () => {
                      const n = normalizePartnerName(newName);
                      if (!n) return;
                      await addPartner(n);
                      setNewName("");
                    }}
                  >
                    추가
                  </button>
                </div>
              </div>

              {/* 삭제는 여기에서만 제공 */}
              <div className="max-h-[220px] overflow-auto">
                {visibleOptions.length === 0 ? (
                  <div className="px-3 py-2 text-[11px] text-slate-500">등록된 거래처가 없습니다.</div>
                ) : (
                  visibleOptions.map((o) => (
                    <div key={o} className="flex items-stretch border-b last:border-b-0">
                      <button
                        type="button"
                        className="flex-1 text-left px-3 py-2 text-xs hover:bg-slate-50"
                        onClick={() => {
                          // 관리 화면에서도 클릭 선택 가능(편의)
                          const n = normalizePartnerName(o);
                          onChange(n);
                          setDraftText(n);
                          closePopup();
                        }}
                      >
                        {o}
                      </button>
                      <button
                        type="button"
                        className="w-12 text-[11px] border-l hover:bg-red-50 text-red-600"
                        onClick={() => void deletePartner(o)}
                        title="삭제"
                      >
                        삭제
                      </button>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}