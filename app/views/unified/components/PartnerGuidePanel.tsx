// app/views/unified/components/PartnerGuidePanel.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type GuideCategory = {
  name: string;
  sort_key?: number;
};

type PartnerGuideMapping = {
  partner_name: string;
  guide_name: string | null;
};

type SignupSettings = {
  partnerOptions: string[];
};

function normalizeName(v: any) {
  return String(v ?? "").trim();
}

function sortKorean(a: string, b: string) {
  return String(a).localeCompare(String(b), "ko");
}

export default function PartnerGuidePanel(props: {
  open: boolean;
  onClose: () => void;

  /** 이미 UnifiedMainView에서 불러온 partnerOptions가 있으면 재사용(없으면 내부 fetch) */
  partnerOptions?: string[];

  /** 저장/변경 후 외부(=UnifiedMainView)에서 syncEmitUnifiedUpdate() 등 실행할 때 사용 */
  onChanged?: () => void;
}) {
  const { open, onClose, onChanged } = props;

  // ---------------------------------------------------------------------------
  // draggable panel (local UI state only)
  // ---------------------------------------------------------------------------
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 120, y: 120 });
  const dragRef = useRef<{
    dragging: boolean;
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
  } | null>(null);

  function clampToViewport(x: number, y: number) {
    const margin = 12;
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const maxX = Math.max(margin, vw - 560); // 패널 폭(대략) 고려
    const maxY = Math.max(margin, vh - 520); // 패널 높이(대략) 고려
    return {
      x: Math.min(maxX, Math.max(margin, x)),
      y: Math.min(maxY, Math.max(margin, y)),
    };
  }

  // ---------------------------------------------------------------------------
  // data
  // ---------------------------------------------------------------------------
  const [partners, setPartners] = useState<string[]>([]);
  const [categories, setCategories] = useState<GuideCategory[]>([]);
  const [mappings, setMappings] = useState<Record<string, string | null>>({});
  const [selectedPartner, setSelectedPartner] = useState<string>("");
  const [selectedGuide, setSelectedGuide] = useState<string>("");

  const selectedPartnerGuide = mappings[selectedPartner] ?? null;

  const filteredPartners = useMemo(() => {
    // 정렬은 가독성 위해 유지
    const list = [...partners];
    list.sort(sortKorean);
    return list;
  }, [partners]);

  async function loadPartnersFromSignupSettings() {
    const r = await fetch("/api/signup-settings", { cache: "no-store" });
    if (!r.ok) return [];

    const j = (await r.json()) as Partial<SignupSettings> | null;
    const list = Array.isArray(j?.partnerOptions) ? j!.partnerOptions.map(String) : [];

    const merged = Array.from(new Set(list.map(normalizeName).filter(Boolean)));
    merged.sort(sortKorean);
    return merged;
  }

  async function loadCategories() {
    const r = await fetch("/api/guide-categories", { cache: "no-store" });
    if (!r.ok) return [];
    const j = await r.json().catch(() => null);
    const list = Array.isArray(j?.categories) ? j.categories : [];
    return list
      .map((x: any) => ({ name: normalizeName(x?.name), sort_key: Number(x?.sort_key ?? 0) }))
      .filter((x: GuideCategory) => !!x.name);
  }

  async function loadMappings() {
    const r = await fetch("/api/partner-guide-map", { cache: "no-store" });
    if (!r.ok) return {};
    const j = await r.json().catch(() => null);
    const list = Array.isArray(j?.mappings) ? (j.mappings as PartnerGuideMapping[]) : [];

    const map: Record<string, string | null> = {};
    for (const row of list) {
      const p = normalizeName((row as any)?.partner_name);
      if (!p) continue;
      map[p] = normalizeName((row as any)?.guide_name) || null;
    }
    return map;
  }

  async function refreshAll() {
    const p =
      Array.isArray(props.partnerOptions) && props.partnerOptions.length
        ? Array.from(new Set(props.partnerOptions.map(normalizeName).filter(Boolean))).sort(sortKorean)
        : await loadPartnersFromSignupSettings();

    const [c, m] = await Promise.all([loadCategories(), loadMappings()]);

    setPartners(p);
    setCategories(c);
    setMappings(m);

    // 선택값 보정
    setSelectedPartner((prev) => {
      const next = prev && p.includes(prev) ? prev : p[0] ?? "";
      return next;
    });
  }

  // open 시 로드
  useEffect(() => {
    if (!open) return;
    void refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // selectedPartner가 바뀌면 우측 선택 가이드 표시 보정
  useEffect(() => {
    if (!open) return;
    const g = mappings[selectedPartner] ?? null;
    setSelectedGuide(g ?? "");
  }, [open, selectedPartner, mappings]);

  // ---------------------------------------------------------------------------
  // actions
  // ---------------------------------------------------------------------------
  async function patchMapping(partner_name: string, guide_name: string | null) {
    const r = await fetch("/api/partner-guide-map", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partner_name, guide_name }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(t || `FAILED(${r.status})`);
    }

    setMappings((prev) => ({ ...prev, [partner_name]: guide_name }));
    onChanged?.();
  }

  async function addCategory() {
    const name = normalizeName(prompt("추가할 안내분류 이름을 입력하세요") ?? "");
    if (!name) return;

    const r = await fetch("/api/guide-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });

    if (!r.ok) {
      const t = await r.text().catch(() => "");
      alert(t || `FAILED(${r.status})`);
      return;
    }

    const next = await loadCategories();
    setCategories(next);
  }

  async function deleteCategory() {
    const target = normalizeName(selectedGuide);
    if (!target) {
      alert("삭제할 안내분류를 먼저 선택하세요.");
      return;
    }

    const ok = confirm(`안내분류 "${target}" 를 삭제할까요?\n(삭제 후에도 기존 행 데이터는 그대로 남아있을 수 있습니다.)`);
    if (!ok) return;

    const r = await fetch("/api/guide-categories", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: target }),
    });

    if (!r.ok) {
      const t = await r.text().catch(() => "");
      alert(t || `FAILED(${r.status})`);
      return;
    }

    const next = await loadCategories();
    setCategories(next);

    // 현재 선택이 삭제된 경우 정리
    setSelectedGuide((g) => (g === target ? "" : g));
  }

  if (!open) return null;

  return (
    <div
      className="fixed z-[70]"
      style={{
        left: pos.x,
        top: pos.y,
        width: 560,
        height: 520,
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full h-full bg-white border shadow-lg flex flex-col">
        {/* header (drag handle) */}
        <div
          className="flex items-center justify-between px-3 py-2 border-b bg-slate-50 select-none cursor-move"
          onMouseDown={(e) => {
            if (e.button !== 0) return;
            dragRef.current = {
              dragging: true,
              startX: e.clientX,
              startY: e.clientY,
              baseX: pos.x,
              baseY: pos.y,
            };

            const onMove = (ev: MouseEvent) => {
              const st = dragRef.current;
              if (!st?.dragging) return;
              const dx = ev.clientX - st.startX;
              const dy = ev.clientY - st.startY;
              const next = clampToViewport(st.baseX + dx, st.baseY + dy);
              setPos(next);
            };

            const onUp = () => {
              if (dragRef.current) dragRef.current.dragging = false;
              window.removeEventListener("mousemove", onMove);
              window.removeEventListener("mouseup", onUp);
            };

            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onUp);
          }}
        >
          <div className="text-sm font-semibold text-slate-700">안내분류 설정(거래처별)</div>
          <button
            type="button"
            className="text-xs px-2 py-1 border rounded bg-white hover:bg-slate-100"
            onClick={onClose}
          >
            닫기
          </button>
        </div>

        {/* body */}
        <div className="flex-1 min-h-0 grid grid-cols-2 gap-0">
          {/* left: partners */}
          <div className="flex flex-col border-r min-h-0">
            <div className="px-3 py-2 text-xs font-semibold text-slate-700 border-b bg-white">
              거래처 ({filteredPartners.length})
            </div>

            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white">
                  <tr>
                    <th className="text-left px-3 py-2 border-b text-slate-600">거래처</th>
                    <th className="text-left px-3 py-2 border-b text-slate-600">안내분류</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPartners.map((p) => {
                    const isActive = p === selectedPartner;
                    const g = mappings[p] ?? null;

                    return (
                      <tr
                        key={p}
                        className={isActive ? "bg-blue-50" : "bg-white"}
                        onClick={() => setSelectedPartner(p)}
                        style={{ cursor: "pointer" }}
                      >
                        <td className="px-3 py-1.5 border-b text-slate-800 whitespace-nowrap overflow-hidden text-ellipsis">
                          {p}
                        </td>
                        <td className="px-3 py-1.5 border-b text-slate-600 whitespace-nowrap overflow-hidden text-ellipsis">
                          {g ?? ""}
                        </td>
                      </tr>
                    );
                  })}
                  {!filteredPartners.length && (
                    <tr>
                      <td className="px-3 py-4 text-slate-400" colSpan={2}>
                        거래처 목록이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* right: guide categories */}
          <div className="flex flex-col min-h-0">
            <div className="px-3 py-2 text-xs font-semibold text-slate-700 border-b bg-white">
              안내분류 ({categories.length})
            </div>

            <div className="px-3 py-2 text-xs text-slate-600 border-b bg-white">
              선택 거래처: <span className="font-semibold text-slate-800">{selectedPartner || "-"}</span>
              <br />
              현재 안내분류:{" "}
              <span className="font-semibold text-slate-800">{selectedPartnerGuide ?? "(비어있음)"}</span>
            </div>

            <div className="flex-1 min-h-0 overflow-auto">
              <div className="p-2">
                {categories.map((c) => {
                  const isSelected = c.name === selectedGuide;
                  return (
                    <button
                      key={c.name}
                      type="button"
                      className={
                        "w-full text-left px-2 py-1.5 text-xs border rounded mb-1 " +
                        (isSelected ? "bg-blue-600 text-white border-blue-600" : "bg-white hover:bg-slate-50")
                      }
                      onClick={async () => {
                        if (!selectedPartner) return;
                        setSelectedGuide(c.name);
                        await patchMapping(selectedPartner, c.name);
                      }}
                      title="클릭하면 선택 거래처의 안내분류가 이 값으로 세팅됩니다."
                    >
                      {c.name}
                    </button>
                  );
                })}
                {!categories.length && (
                  <div className="px-2 py-4 text-xs text-slate-400">안내분류가 없습니다. 아래에서 추가하세요.</div>
                )}
              </div>
            </div>

            <div className="border-t p-2 flex items-center gap-2">
              <button
                type="button"
                className="flex-1 text-xs px-2 py-2 border rounded bg-white hover:bg-slate-50"
                onClick={addCategory}
              >
                안내분류 추가
              </button>
              <button
                type="button"
                className="flex-1 text-xs px-2 py-2 border rounded bg-white hover:bg-slate-50"
                onClick={deleteCategory}
              >
                안내분류 삭제
              </button>
              <button
                type="button"
                className="text-xs px-2 py-2 border rounded bg-white hover:bg-slate-50"
                onClick={async () => {
                  await refreshAll();
                }}
                title="거래처/안내분류/매핑 재조회"
              >
                새로고침
              </button>
            </div>
          </div>
        </div>

        {/* footer hint */}
        <div className="px-3 py-2 border-t bg-white text-[11px] text-slate-500">
          - 거래처를 선택한 뒤, 우측 안내분류를 클릭하면 매핑이 저장됩니다.
          <br />
          - 패널 상단을 드래그해서 위치를 옮길 수 있습니다.
        </div>
      </div>
    </div>
  );
}