"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addPartnerOptionViaApi,
  fetchPartnerOptionsFromApi,
  mergePartnerOptionsWithValue,
  normalizePartnerName,
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
  const [remoteOptions, setRemoteOptions] = useState<string[]>([]);

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

  const baseOptions = options.length > 0 ? options : remoteOptions;

  const mergedOptions = useMemo(() => {
    return mergePartnerOptionsWithValue(baseOptions, value);
  }, [baseOptions, value]);

  async function handleAdd() {
    const name = window.prompt("신규 거래처를 입력해 주세요.");
    const n = normalizePartnerName(name);
    if (!n) return;

    try {
      if (onAddPartnerOption) {
        await onAddPartnerOption(n);
        setRemoteOptions((prev) => Array.from(new Set([...prev, n])));
      } else {
        const saved = await addPartnerOptionViaApi(n);
        setRemoteOptions(saved);
      }
      onChange(n);
    } catch {
      // ignore
    }
  }

  async function handleDelete() {
    const name = window.prompt("삭제할 거래처명을 입력해 주세요.");
    const n = normalizePartnerName(name);
    if (!n) return;

    const ok = window.confirm(`거래처 "${n}" 를 삭제할까요?`);
    if (!ok) return;

    try {
      const saved = await removePartnerOptionViaApi(n);
      setRemoteOptions(saved);

      if (normalizePartnerName(value) === n) {
        onChange("");
      } else {
        // 값 유지
        onChange(String(value ?? ""));
      }
    } catch {
      // ignore
    }
  }

  return (
    <select
      className={[
        "w-full h-[26px] px-2 py-0.5 outline-none bg-transparent text-[12px] font-normal text-slate-500 text-center",
        "appearance-none",
      ].join(" ")}
      style={{ backgroundImage: "none" }}
      value={String(value ?? "")}
      onFocus={onFocus}
      onChange={async (e) => {
        const v = e.target.value;

        if (v === "__ADD__") {
          await handleAdd();
          return;
        }

        if (v === "__DELETE__") {
          await handleDelete();
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

      <option value="__ADD__">+ 신규거래처 추가...</option>
      <option value="__DELETE__">- 기존거래처 삭제...</option>
    </select>
  );
}