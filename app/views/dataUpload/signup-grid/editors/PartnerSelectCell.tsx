"use client";

import { useEffect, useId, useMemo, useState } from "react";
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
  const datalistId = useId();

  const [remoteOptions, setRemoteOptions] = useState<string[]>([]);
  const [optimisticAdded, setOptimisticAdded] = useState<string[]>([]);

  useEffect(() => {
    if (Array.isArray(options) && options.length > 0) return;

    let mounted = true;
    (async () => {
      try {
        const list = await fetchPartnerOptionsFromApi();
        if (!mounted) return;
        setRemoteOptions(list);
      } catch {
        // 로드 실패해도 셀 동작은 유지
      }
    })();

    return () => {
      mounted = false;
    };
  }, [options]);

  const baseOptions = options.length > 0 ? options : remoteOptions;

  const mergedOptions = useMemo(() => {
    const combined = [...baseOptions, ...optimisticAdded];
    return mergePartnerOptionsWithValue(combined, value);
  }, [baseOptions, optimisticAdded, value]);

  const baseSet = useMemo(() => new Set(normalizePartnerOptions(baseOptions)), [baseOptions]);

  async function commitIfNew(raw: string) {
    const n = normalizePartnerName(raw);
    if (!n) return;

    // 이미 아는 옵션이면 저장(추가) 불필요
    if (baseSet.has(n)) return;

    // optimistic 반영(즉시 datalist에 뜨게)
    setOptimisticAdded((prev) => (prev.includes(n) ? prev : [...prev, n]));

    try {
      if (onAddPartnerOption) {
        await onAddPartnerOption(n);
      } else {
        const saved = await addPartnerOptionViaApi(n);
        setRemoteOptions(saved);
      }
    } catch {
      // 실패해도 입력 흐름은 유지
    }
  }

  return (
    <div className="w-full h-[26px]">
      <input
        list={datalistId}
        className={[
          "w-full h-[26px] px-2 py-0.5 outline-none bg-transparent text-[12px] font-normal text-slate-500 text-center",
        ].join(" ")}
        value={String(value ?? "")}
        onFocus={onFocus}
        onChange={(e) => {
          // 입력 중에는 셀 값만 즉시 반영(그리드의 기존 입력 흐름 유지)
          onChange(e.target.value);
        }}
        onKeyDown={async (e) => {
          if (e.key !== "Enter") return;
          // Enter 시: 직접입력 값이 새 옵션이면 저장까지
          await commitIfNew((e.currentTarget as HTMLInputElement).value);
          onChange(normalizePartnerName((e.currentTarget as HTMLInputElement).value));
        }}
        onBlur={async (e) => {
          const next = normalizePartnerName(e.currentTarget.value);
          onChange(next);
          await commitIfNew(next);
        }}
      />

      <datalist id={datalistId}>
        {mergedOptions.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </div>
  );
}