"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

  // 상위에서 내려주면 사용(없으면 내부에서 /api 로드로 보완)
  options: string[];

  // 상위에서 DB/API 저장을 맡길 수도 있음(신규가입 View에서 settings 저장)
  // 다만 신규가입에서는 저장이 디바운스/큐로 지연될 수 있으므로,
  // 이 컴포넌트는 "리스트 즉시 반영"을 위해 서버를 직접 patch+reload 한다.
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
    try {
      const r = await fetch("/api/signup-settings", { cache: "no-store" });
      if (!r.ok) return;

      const j = (await r.json()) as Partial<SignupSettings> | null;
      const list = Array.isArray(j?.partnerOptions) ? j!.partnerOptions.map(String) : [];

      const merged = Array.from(new Set(list.map(normalizeName).filter(Boolean)));
      merged.sort(sortKorean);
      setRemoteOptions(merged);
    } catch {
      // ignore
    }
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

    // 서버 기준으로 즉시 갱신(캐시/지연 저장 문제 회피)
    await loadOptionsNoStore();
  }

  useEffect(() => {
    void loadOptionsNoStore();
  }, []);

  // ✅ 기본은 서버(remoteOptions)를 소스로 사용
  // (서버를 아직 못 불러온 초기만 props options를 fallback)
  const baseOptions = remoteOptions.length > 0 ? remoteOptions : options;

  const mergedOptions = useMemo(() => {
    const cur = normalizeName(value);
    const merged = cur ? Array.from(new Set([cur, ...(baseOptions || [])])) : Array.from(new Set(baseOptions || []));
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
          onChange(normalizeName(name));
        }}
        onClose={() => setOpen(false)}
        onAdd={async (name) => {
          const n = normalizeName(name);
          if (!n) return;

          // 1) 셀 값은 즉시 반영
          onChange(n);

          // 2) 리스트(서버)에도 즉시 반영
          const curList = remoteOptionsRef.current.length > 0 ? remoteOptionsRef.current : options;
          const next = Array.from(new Set([...(curList || []), n]));
          await patchOptionsNoStore(next);

          // 3) 상위 상태도 맞춰주고 싶으면(선택) 호출 (지연 저장이어도 UI는 서버가 소스)
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
          if (normalizeName(value) === n) {
            onChange("");
          }
        }}
      />
    </>
  );
}