"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addPartnerOptionViaApi,
  fetchPartnerOptionsFromApi,
  mergePartnerOptionsWithValue,
  normalizePartnerName,
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

  async function handleAddNew() {
    const name = window.prompt("신규 거래처를 입력해 주세요.");
    const n = normalizePartnerName(name);

    if (!n) {
      onChange(String(value ?? ""));
      return;
    }

    setOptimisticAdded((prev) => (prev.includes(n) ? prev : [...prev, n]));

    try {
      if (onAddPartnerOption) {
        await onAddPartnerOption(n);
      } else {
        const saved = await addPartnerOptionViaApi(n);
        setRemoteOptions(saved);
      }
    } catch {
      // 실패해도 UI 흐름은 유지
    } finally {
      onChange(n);
    }
  }

  return (
    <select
      className={[
        "w-full h-[26px] px-2 py-0.5 outline-none bg-transparent text-[12px] font-normal text-slate-500 text-center",
        // ▼ 아이콘 숨김
        "appearance-none",
      ].join(" ")}
      style={{
        // 브라우저별 기본 화살표/배경 제거 보강
        backgroundImage: "none",
      }}
      value={value}
      onFocus={onFocus}
      onChange={async (e) => {
        const v = e.target.value;

        if (v === "__ADD__") {
          await handleAddNew();
          return;
        }

        onChange(v);
      }}
    >
      <option value=""></option>

      {mergedOptions.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}

      <option value="__ADD__">+ 신규 거래처 추가...</option>
    </select>
  );
}