"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { syncEmitUnifiedUpdate } from "@/global-sync/sync-engine";
import PartnerPickerPopover from "@/views/dataUpload/signup-grid/partner-picker/PartnerPickerPopover";

function normalizeName(v: any) {
  return String(v ?? "").trim();
}

function sortKorean(a: string, b: string) {
  return String(a).localeCompare(String(b), "ko");
}

type SignupSettings = {
  selectedKeys: string[];
  colWidthSteps: Record<string, number>;
  rowCount: number;
  partnerOptions: string[];
};

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

  // 상위에서 내려주면 fallback으로만 사용(최신은 DB에서 읽음)
  options: string[];

  // CellEditor에서 내려주는 prop(타입 호환 유지)
  onAddPartnerOption?: (name: string) => void | Promise<void>;
}) {
  const [remoteOptions, setRemoteOptions] = useState<string[]>([]);
  const remoteOptionsRef = useRef<string[]>([]);
  useEffect(() => {
    remoteOptionsRef.current = remoteOptions;
  }, [remoteOptions]);

  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  async function loadOptionsNoStore() {
    const r = await fetch("/api/signup-settings", { cache: "no-store" });
    if (!r.ok) return;

    const j = (await r.json()) as Partial<SignupSettings> | null;
    const list = Array.isArray(j?.partnerOptions) ? j!.partnerOptions.map(String) : [];

    const merged = Array.from(new Set(list.map(normalizeName).filter(Boolean)));
    merged.sort(sortKorean);
    setRemoteOptions(merged);
  }

  async function patchOptionsNoStore(next: string[]) {
    const merged = Array.from(new Set((next || []).map(normalizeName).filter(Boolean)));
    merged.sort(sortKorean);

    const r = await fetch("/api/signup-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partnerOptions: merged }),
    });

    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(t || `FAILED(${r.status})`);
    }

    // ✅ 서버 기준 즉시 재조회(리스트 즉시 반영)
    await loadOptionsNoStore();

    // ✅ 다른 화면/탭도 즉시 반영되게 emit
    syncEmitUnifiedUpdate();
  }

  useEffect(() => {
    void loadOptionsNoStore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ 기본은 서버(remoteOptions)가 소스. 서버가 아직 없으면 props options로 fallback.
  const baseOptions = remoteOptions.length > 0 ? remoteOptions : options;

  const mergedOptions = useMemo(() => {
    const cur = normalizeName(value);
    const merged = cur
      ? Array.from(new Set([cur, ...(baseOptions || [])]))
      : Array.from(new Set(baseOptions || []));
    const cleaned = merged.map(normalizeName).filter(Boolean);
    cleaned.sort(sortKorean);
    return cleaned;
  }, [baseOptions, value]);

  function openPopoverAt(e: React.MouseEvent) {
    onFocus();
    setPos({ x: e.clientX, y: e.clientY });
    setOpen(true);
  }

  return (
    <>
      {/* 셀 표시(클릭 시 팝오버 오픈) */}
      <div
        className={[
          "w-full h-[26px] px-2 py-0.5 text-[12px] font-normal text-slate-500",
          "flex items-center justify-center",
          "bg-transparent",
          "cursor-pointer select-none",
        ].join(" ")}
        tabIndex={0}
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          onFocus();
        }}
        onClick={(e) => {
          openPopoverAt(e);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            setPos({ x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.bottom) });
            setOpen(true);
          }
        }}
        title={String(value ?? "")}
      >
        <span className="truncate w-full text-center">{String(value ?? "")}</span>
      </div>

      <PartnerPickerPopover
        open={open}
        x={pos.x}
        y={pos.y}
        options={mergedOptions}
        value={String(value ?? "")}
        onSelect={(name) => {
          // 선택은 셀 값만 변경
          onChange(normalizeName(name));
        }}
        onClose={() => setOpen(false)}
        onAdd={async (name) => {
          const n = normalizeName(name);
          if (!n) return;

          // 1) 셀 값 즉시 반영
          onChange(n);

          // 2) 리스트(DB) 즉시 반영
          const curList = remoteOptionsRef.current.length > 0 ? remoteOptionsRef.current : options;
          const next = Array.from(new Set([...(curList || []), n]));
          await patchOptionsNoStore(next);

          // 3) 상위도 best-effort로 맞춤(있으면)
          try {
            await onAddPartnerOption?.(n);
          } catch {
            // ignore
          }
        }}
        onDelete={async (name) => {
          const n = normalizeName(name);
          if (!n) return;

          const curList = remoteOptionsRef.current.length > 0 ? remoteOptionsRef.current : options;
          const next = (curList || []).filter((x) => normalizeName(x) !== n);
          await patchOptionsNoStore(next);

          // 삭제된 값이 현재 셀 값이면 비우기
          if (normalizeName(value) === n) onChange("");
        }}
      />
    </>
  );
}