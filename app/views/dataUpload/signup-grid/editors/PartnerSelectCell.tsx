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

  // 상위에서 내려주면 사용(없으면 내부에서 /api 로드로 보완)
  options: string[];

  // 상위에서 DB/API 저장을 맡길 수도 있음(없으면 내부에서 /api/signup-settings로 저장)
  onAddPartnerOption?: (name: string) => void | Promise<void>;
}) {
  const anchorRef = useRef<HTMLInputElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);

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

  // 열려있지 않을 때만 외부 value를 draftText로 반영
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

    // 기본 폭은 220px, 화면 밖으로 나가면 보정
    const width = 220;
    const maxLeft = Math.max(8, window.innerWidth - width - 8);
    const left = Math.max(8, Math.min(rect.left, maxLeft));

    // 아래로 펼침(필요 시 추후 위로 펼침 로직 추가 가능)
    const top = rect.bottom;

    setPopupPos({ left, top, width });
  }

  function openPopup() {
    setMode("select");
    setNewName("");
    setOpen(true);
    // open 직후 위치 계산
    requestAnimationFrame(() => {
      computePopupPos();
    });
  }

  function closePopup() {
    setOpen(false);
    setMode("select");
    setNewName("");
  }

  // 팝업이 열린 동안: 리사이즈/스크롤 시 위치 갱신
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

  // 팝업이 열린 동안: 바깥 클릭/ESC로 닫기
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t) return;

      // 앵커(셀) 클릭은 무시
      if (anchorRef.current && anchorRef.current.contains(t as any)) return;

      // 팝업 내부 클릭은 무시
      if (popupRef.current && popupRef.current.contains(t as any)) return;

      closePopup();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePopup();
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function addPartner(nameRaw: string) {
    const n = normalizePartnerName(nameRaw);
    if (!n) return;

    try {
      if (onAddPartnerOption) {
        await onAddPartnerOption(n);
        // 상위에서 partnerOptions 상태를 갱신한다는 가정이지만,
        // 혹시 즉시 반영이 느리면 로컬 remoteOptions에도 추가(보완)
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

  const popup = open && popupPos
    ? createPortal(
        <div
          ref={popupRef}
          className="fixed z-[9999] bg-white border rounded shadow-md overflow-hidden"
          style={{ left: popupPos.left, top: popupPos.top, width: popupPos.width }}
        >
          {/* ---------------- select 모드 ---------------- */}
          {mode === "select" && (
            <>
              {/* 1) 첫번째 칸: 직접 입력 가능 */}
              <div className="p-2 border-b">
                <input
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
                  autoFocus
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
                        onChange(n);          // ✅ 클릭 시 해당 칸에 입력
                        setDraftText(n);
                        closePopup();         // ✅ 입력창(팝업) 사라짐
                      }}
                    >
                      {o}
                    </button>
                  ))
                )}
              </div>

              {/* 신규거래처 추가(관리 모드로 진입: 여기에서 추가/삭제) */}
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
                    onClick={async () => {
                      const n = normalizePartnerName(newName);
                      if (!n) return;
                      await addPartner(n);  // ✅ 추가 버튼 작동
                      setNewName("");
                    }}
                  >
                    추가
                  </button>
                </div>
              </div>

              {/* 삭제는 여기에서만 제공 */}
              <div className="max-h-[220px] overflow-auto">
                {baseOptions.length === 0 ? (
                  <div className="px-3 py-2 text-[11px] text-slate-500">등록된 거래처가 없습니다.</div>
                ) : (
                  baseOptions.map((o) => (
                    <div key={o} className="flex items-stretch border-b last:border-b-0">
                      <button
                        type="button"
                        className="flex-1 text-left px-3 py-2 text-xs hover:bg-slate-50"
                        onClick={() => {
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
        </div>,
        document.body
      )
    : null;

  return (
    <>
      {/* 셀 쉘: Grid에서 interactive로 인식되도록 input 유지 */}
      <input
        ref={anchorRef}
        readOnly
        className="w-full h-[26px] px-2 py-0.5 outline-none bg-transparent text-[12px] font-normal text-slate-500 text-center cursor-pointer"
        value={String(value ?? "")}
        onFocus={onFocus}
        onPointerDown={() => {
          // Grid가 셀 선택/드래그를 처리하고, 여기서는 팝업만 연다.
          openPopup();
        }}
      />
      {popup}
    </>
  );
}