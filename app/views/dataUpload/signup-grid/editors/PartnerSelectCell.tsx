"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

  options: string[];
  onAddPartnerOption?: (name: string) => void | Promise<void>;
}) {
  const anchorRef = useRef<HTMLInputElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);

  const selectInputRef = useRef<HTMLInputElement | null>(null);
  const manageInputRef = useRef<HTMLInputElement | null>(null);

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"select" | "manage">("select");

  const [remoteOptions, setRemoteOptions] = useState<string[]>([]);
  const [draftText, setDraftText] = useState<string>(String(value ?? ""));
  const [newName, setNewName] = useState<string>("");

  const [popupPos, setPopupPos] = useState<{ left: number; top: number; width: number } | null>(null);

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

  // 팝업이 닫혀있을 때만 외부 value를 draftText로 반영
  useEffect(() => {
    if (open) return;
    setDraftText(String(value ?? ""));
  }, [value, open]);

  const baseOptions = useMemo(() => {
    const src = Array.isArray(options) && options.length > 0 ? options : remoteOptions;
    return normalizePartnerOptions(src);
  }, [options, remoteOptions]);

  const filteredOptions = useMemo(() => {
    const q = normalizePartnerName(draftText).toLowerCase();
    if (!q) return baseOptions;
    return baseOptions.filter((o) => String(o).toLowerCase().includes(q));
  }, [baseOptions, draftText]);

  function computePopupPos() {
    const el = anchorRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const width = 220;

    const maxLeft = Math.max(8, window.innerWidth - width - 8);
    const left = Math.max(8, Math.min(rect.left, maxLeft));
    const top = rect.bottom;

    setPopupPos({ left, top, width });
  }

  function openPopup() {
    setMode("select");
    setNewName("");
    setOpen(true);
    requestAnimationFrame(() => {
      computePopupPos();
      requestAnimationFrame(() => {
        try {
          selectInputRef.current?.focus();
          selectInputRef.current?.select();
        } catch {}
      });
    });
  }

  function closePopup() {
    setOpen(false);
    setMode("select");
    setNewName("");
  }

  // 열려있는 동안 스크롤/리사이즈 시 위치 보정
  useEffect(() => {
    if (!open) return;
    const onScroll = () => computePopupPos();
    const onResize = () => computePopupPos();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  // 바깥 클릭/ESC로 닫기 (mousedown 캡처로 클릭 안정화)
  useEffect(() => {
    if (!open) return;

    const onMouseDownCapture = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;

      if (anchorRef.current && anchorRef.current.contains(t as any)) return;
      if (popupRef.current && popupRef.current.contains(t as any)) return;

      closePopup();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePopup();
    };

    document.addEventListener("mousedown", onMouseDownCapture, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDownCapture, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function addPartner(nameRaw: string) {
    const n = normalizePartnerName(nameRaw);
    if (!n) return;

    try {
      if (onAddPartnerOption) {
        await onAddPartnerOption(n);
        // 상위 반영이 지연되어도 즉시 보이도록 로컬 목록도 보강
        setRemoteOptions((prev) => normalizePartnerOptions([...prev, n]));
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

  const popup =
    open && popupPos
      ? createPortal(
          <div
            ref={popupRef}
            className="fixed z-[9999] bg-white border rounded shadow-md overflow-hidden"
            style={{ left: popupPos.left, top: popupPos.top, width: popupPos.width }}
            // ✅ 그리드 셀 포인터캡처/드래그에 빨려들어가지 않게 캡처 단계에서 차단
            onPointerDownCapture={(e) => {
              e.stopPropagation();
            }}
            onMouseDownCapture={(e) => {
              e.stopPropagation();
            }}
          >
            {mode === "select" && (
              <>
                <div className="p-2 border-b">
                  <input
                    ref={selectInputRef}
                    className="w-full border rounded px-2 py-1 text-xs outline-none"
                    placeholder="거래처 입력..."
                    value={draftText}
                    onChange={(e) => {
                      const v = e.target.value;
                      setDraftText(v);
                      onChange(v);
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      closePopup();
                    }}
                    autoFocus
                  />
                </div>

                <div className="max-h-[220px] overflow-auto">
                  {filteredOptions.length === 0 ? (
                    <div className="px-3 py-2 text-[11px] text-slate-500">등록된 거래처가 없습니다.</div>
                  ) : (
                    filteredOptions.map((o) => (
                      <button
                        key={o}
                        type="button"
                        className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 border-b last:border-b-0"
                        // ✅ click 대신 mousedown에서 확정(클릭 누락 방지)
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const n = normalizePartnerName(o);
                          onChange(n); // 값 입력
                          setDraftText(n);
                          closePopup(); // 팝업 사라짐
                        }}
                      >
                        {o}
                      </button>
                    ))
                  )}
                </div>

                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setMode("manage");
                    setNewName("");
                    requestAnimationFrame(() => {
                      try {
                        manageInputRef.current?.focus();
                        manageInputRef.current?.select();
                      } catch {}
                    });
                  }}
                >
                  신규거래처 추가
                </button>
              </>
            )}

            {mode === "manage" && (
              <>
                <div className="px-2 py-2 border-b flex items-center justify-between">
                  <div className="text-[11px] font-semibold text-slate-700">거래처 관리</div>
                  <button
                    type="button"
                    className="text-[11px] px-2 py-1 border rounded bg-white hover:bg-slate-50"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setMode("select");
                      setNewName("");
                      requestAnimationFrame(() => {
                        try {
                          selectInputRef.current?.focus();
                          selectInputRef.current?.select();
                        } catch {}
                      });
                    }}
                  >
                    돌아가기
                  </button>
                </div>

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
                      autoFocus
                    />
                    <button
                      type="button"
                      className="text-[11px] px-2 py-1 border rounded bg-white hover:bg-slate-50"
                      onMouseDown={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
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

                <div className="max-h-[220px] overflow-auto">
                  {baseOptions.length === 0 ? (
                    <div className="px-3 py-2 text-[11px] text-slate-500">등록된 거래처가 없습니다.</div>
                  ) : (
                    baseOptions.map((o) => (
                      <div key={o} className="flex items-stretch border-b last:border-b-0">
                        <button
                          type="button"
                          className="flex-1 text-left px-3 py-2 text-xs hover:bg-slate-50"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
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
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void deletePartner(o);
                          }}
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
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <input
        ref={anchorRef}
        readOnly
        className="w-full h-[26px] px-2 py-0.5 outline-none bg-transparent text-[12px] font-normal text-slate-500 text-center cursor-pointer"
        value={String(value ?? "")}
        onFocus={onFocus}
        onPointerDown={() => {
          // 셀 선택/드래그는 Grid가 처리, 여기서는 팝업만 연다.
          openPopup();
        }}
      />
      {popup}
    </>
  );
}