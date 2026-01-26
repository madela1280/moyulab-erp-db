"use client";

import { useEffect, useMemo, useState } from "react";
import PartnerPickerPopover from "@/views/dataUpload/signup-grid/partner-picker/PartnerPickerPopover";
import { fetchPartnerOptionsFromApi } from "@/views/dataUpload/signup-grid/editors/partnerOptions";

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

  // 상위에서 DB/API 저장을 맡길 수도 있음(없으면 내부에서 /api/signup-settings로 저장)
  onAddPartnerOption?: (name: string) => void | Promise<void>;
}) {
  const [remoteOptions, setRemoteOptions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // ✅ DB 최신 옵션을 우선 사용(추가/삭제 직후 즉시 반영)
  async function reloadOptionsFromServer() {
    try {
      const list = await fetchPartnerOptionsFromApi();
      const merged = Array.from(new Set((list || []).map(normalizeName).filter(Boolean)));
      merged.sort(sortKorean);
      setRemoteOptions(merged);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    void reloadOptionsFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 상위 options는 fallback (remoteOptions가 비어있을 때만 사용)
  const baseOptions = remoteOptions.length > 0 ? remoteOptions : options;

  const mergedOptions = useMemo(() => {
    const cur = normalizeName(value);
    const merged = cur ? Array.from(new Set([cur, ...(baseOptions || [])])) : Array.from(new Set(baseOptions || []));
    const cleaned = merged.map(normalizeName).filter(Boolean);
    cleaned.sort(sortKorean);
    return cleaned;
  }, [baseOptions, value]);

  async function patchPartnerOptions(next: string[]) {
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

    // 서버 기준으로 다시 로드(동시편집/정렬/중복 방지)
    await reloadOptionsFromServer();
  }

  function openPopoverAt(e: React.MouseEvent) {
    onFocus();
    setPos({ x: e.clientX, y: e.clientY });
    setOpen(true);
  }

  return (
    <>
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

          // 1) 상위에서 맡기면 상위 로직 사용(=settings 저장 포함)
          if (onAddPartnerOption) {
            await onAddPartnerOption(n);
            await reloadOptionsFromServer();
            onChange(n);
            return;
          }

          // 2) 없으면 여기서 settings에 직접 저장
          const next = Array.from(new Set([...(remoteOptions.length ? remoteOptions : options), n]));
          await patchPartnerOptions(next);
          onChange(n);
        }}
        onDelete={async (name) => {
          const n = normalizeName(name);
          if (!n) return;

          const next = (remoteOptions.length ? remoteOptions : options).filter((x) => normalizeName(x) !== n);
          await patchPartnerOptions(next);

          if (normalizeName(value) === n) onChange("");
        }}
      />
    </>
  );
}