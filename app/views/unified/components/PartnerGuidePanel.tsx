"use client";

import { useEffect, useMemo, useState } from "react";
import { useDraggablePanel } from "@/views/unified/components/useDraggablePanel";
import {
  createGuideCategory,
  deleteGuideCategory,
  fetchGuideCategories,
  fetchPartnerGuideMappings,
  patchPartnerGuideMapping,
} from "@/views/unified/guide/guideService";

type GuideCategory = {
  name: string;
  sort_key?: number;
  created_by?: string | null;
  created_at?: string | null;
};

type PartnerGuideMapping = {
  partner_name: string;
  guide_name: string | null;
  updated_by?: string | null;
  updated_at?: string | null;
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
  partnerOptions?: string[];
  initialPartner?: string;
  onChanged?: () => void;
}) {
  const { open, onClose, onChanged } = props;

  const { pos, onMouseDownDragHandle } = useDraggablePanel({ x: 120, y: 120 }, { w: 560, h: 520 });

  const [partners, setPartners] = useState<string[]>([]);
  const [categories, setCategories] = useState<GuideCategory[]>([]);
  const [mappings, setMappings] = useState<Record<string, string | null>>({});

  const [selectedPartner, setSelectedPartner] = useState<string>("");
  const [selectedGuide, setSelectedGuide] = useState<string>("");

  // ✅ 입력칸 방식(프롬프트 사용 금지)
  const [newGuideName, setNewGuideName] = useState<string>("");

  const selectedPartnerGuide = mappings[selectedPartner] ?? null;

  const filteredPartners = useMemo(() => {
    const list = [...partners];
    list.sort(sortKorean);
    return list;
  }, [partners]);

  const sortedCategories = useMemo(() => {
    const list = [...categories];
    list.sort((a, b) => {
      const ak = Number(a.sort_key ?? 0);
      const bk = Number(b.sort_key ?? 0);
      if (ak !== bk) return ak - bk;
      return sortKorean(a.name, b.name);
    });
    return list;
  }, [categories]);

  async function loadPartnersFromSignupSettings(): Promise<string[]> {
    const r = await fetch("/api/signup-settings", { cache: "no-store" });
    if (!r.ok) return [];

    const j = (await r.json()) as Partial<SignupSettings> | null;
    const list = Array.isArray(j?.partnerOptions) ? j!.partnerOptions.map(String) : [];

    const merged = Array.from(new Set(list.map(normalizeName).filter(Boolean)));
    merged.sort(sortKorean);
    return merged;
  }

  async function refreshAll() {
    // ✅ partnerOptions prop이 비어있거나 undefined면 항상 서버에서 다시 불러오기
    const propList = Array.isArray(props.partnerOptions) ? props.partnerOptions : [];
    const propMerged = Array.from(new Set(propList.map(normalizeName).filter(Boolean))).sort(sortKorean);

    const p = propMerged.length ? propMerged : await loadPartnersFromSignupSettings();

    const [c, m] = await Promise.all([fetchGuideCategories(), fetchPartnerGuideMappings()]);

    const map: Record<string, string | null> = {};
    for (const row of (m as PartnerGuideMapping[]) || []) {
      const pn = normalizeName((row as any)?.partner_name);
      if (!pn) continue;
      map[pn] = normalizeName((row as any)?.guide_name) || null;
    }

    setPartners(p);
    setCategories(c);
    setMappings(map);

    const init = normalizeName(props.initialPartner);
    const nextPartner = init && p.includes(init) ? init : p[0] ?? "";
    setSelectedPartner(nextPartner);

    const nextGuide = map[nextPartner] ?? null;
    setSelectedGuide(nextGuide ?? "");
  }

  useEffect(() => {
    if (!open) return;
    void refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, props.initialPartner]);

  useEffect(() => {
    if (!open) return;
    const g = mappings[selectedPartner] ?? null;
    setSelectedGuide(g ?? "");
  }, [open, selectedPartner, mappings]);

  async function patchMapping(partner_name: string, guide_name: string | null) {
    await patchPartnerGuideMapping(partner_name, guide_name);
    setMappings((prev) => ({ ...prev, [partner_name]: guide_name }));
    onChanged?.();
  }

  async function handleAddCategory() {
    const name = normalizeName(newGuideName);
    if (!name) return;

    try {
      await createGuideCategory(name);
      setNewGuideName("");

      const next = await fetchGuideCategories();
      setCategories(next);
    } catch (e: any) {
      alert(String(e?.message ?? e ?? "안내분류 추가 실패"));
    }
  }

  async function handleDeleteCategory() {
    const target = normalizeName(selectedGuide);
    if (!target) {
      alert("삭제할 안내분류를 먼저 선택하세요.");
      return;
    }

    const ok = confirm(`안내분류 "${target}" 를 삭제할까요?\n(삭제 후에도 기존 행 데이터는 그대로 남아있을 수 있습니다.)`);
    if (!ok) return;

    try {
      await deleteGuideCategory(target);
      const next = await fetchGuideCategories();
      setCategories(next);

      setSelectedGuide((g) => (g === target ? "" : g));
    } catch (e: any) {
      alert(String(e?.message ?? e ?? "안내분류 삭제 실패"));
    }
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
        <div
          className="flex items-center justify-between px-3 py-2 border-b bg-slate-50 select-none cursor-move"
          onMouseDown={onMouseDownDragHandle}
        >
          <div className="text-sm font-semibold text-slate-700">안내분류 설정(거래처별)</div>
          <button
            type="button"
            className="text-xs px-2 py-1 border rounded bg-white hover:bg-slate-100"
            onClick={onClose}
          >
            확인
          </button>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-2 gap-0">
          {/* left */}
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
                        거래처 목록이 없습니다. (거래처분류 옵션을 확인하세요)
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* right */}
          <div className="flex flex-col min-h-0">
            <div className="px-3 py-2 text-xs font-semibold text-slate-700 border-b bg-white">
              안내분류 ({sortedCategories.length + 1})
            </div>

            <div className="px-3 py-2 text-xs text-slate-600 border-b bg-white">
              선택 거래처: <span className="font-semibold text-slate-800">{selectedPartner || "-"}</span>
              <br />
              현재 안내분류:{" "}
              <span className="font-semibold text-slate-800">{selectedPartnerGuide ?? "(비어있음)"}</span>
            </div>

            <div className="flex-1 min-h-0 overflow-auto">
              <div className="p-2">
                <button
                  type="button"
                  className={
                    "w-full text-left px-2 py-1.5 text-xs border rounded mb-1 " +
                    (!selectedGuide ? "bg-blue-600 text-white border-blue-600" : "bg-white hover:bg-slate-50")
                  }
                  onClick={async () => {
                    if (!selectedPartner) return;
                    setSelectedGuide("");
                    await patchMapping(selectedPartner, null);
                  }}
                >
                  공난
                </button>

                {sortedCategories.map((c) => {
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
                    >
                      {c.name}
                    </button>
                  );
                })}

                {!sortedCategories.length && (
                  <div className="px-2 py-4 text-xs text-slate-400">
                    안내분류가 없습니다. 아래에서 추가하세요.
                  </div>
                )}
              </div>
            </div>

            <div className="border-t p-2 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <input
                  className="flex-1 text-xs px-2 py-2 border rounded"
                  placeholder="새 안내분류 입력"
                  value={newGuideName}
                  onChange={(e) => setNewGuideName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleAddCategory();
                  }}
                />
                <button
                  type="button"
                  className="text-xs px-3 py-2 border rounded bg-white hover:bg-slate-50"
                  onClick={handleAddCategory}
                >
                  추가
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="flex-1 text-xs px-2 py-2 border rounded bg-white hover:bg-slate-50"
                  onClick={handleDeleteCategory}
                >
                  안내분류 삭제
                </button>
                <button
                  type="button"
                  className="text-xs px-2 py-2 border rounded bg-white hover:bg-slate-50"
                  onClick={async () => {
                    await refreshAll();
                  }}
                >
                  새로고침
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="px-3 py-2 border-t bg-white text-[11px] text-slate-500">
          - 거래처를 선택한 뒤, 우측 안내분류를 클릭하면 매핑이 저장됩니다.
          <br />- 패널 상단을 드래그해서 위치를 옮길 수 있습니다.
        </div>
      </div>
    </div>
  );
}