"use client";

import { useMemo, useState } from "react";
import { mergePartnerOptionsWithValue, normalizePartnerName } from "@/views/dataUpload/signup-grid/editors/partnerOptions";

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

  /**
   * 거래처 옵션 목록은 "상위(예: SignupView)"에서 API로 로드한 값을 내려준다.
   * 이 컴포넌트 내부에서는 어떤 저장소(localStorage 포함)도 사용하지 않는다.
   */
  options: string[];

  /**
   * "+ 신규거래처 추가" 시 상위에서 DB/API 저장을 수행하도록 위임한다.
   * 저장 후 options 갱신은 상위 state 업데이트로 반영되는 구조를 권장한다.
   */
  onAddPartnerOption?: (name: string) => void | Promise<void>;
}) {
  // 상위 options 갱신 전까지 UI 즉시 반영을 위한 "임시(비영속) 옵션"만 로컬 상태로 관리
  const [optimisticAdded, setOptimisticAdded] = useState<string[]>([]);

  const mergedOptions = useMemo(() => {
    const combined = [...options, ...optimisticAdded];
    return mergePartnerOptionsWithValue(combined, value);
  }, [options, optimisticAdded, value]);

  return (
    <select
      className="w-full h-[26px] px-2 py-0.5 outline-none bg-transparent text-[12px] font-normal text-slate-500 text-center"
      value={value}
      onFocus={onFocus}
      onChange={async (e) => {
        const v = e.target.value;

        if (v === "__ADD__") {
          const name = prompt("신규 거래처(거래처분류) 이름을 입력하세요.");
          const n = normalizePartnerName(name);

          if (!n) {
            // 취소/빈값이면 기존 값 유지(컨트롤드 값이므로 onChange로 재설정)
            onChange(String(value ?? ""));
            return;
          }

          // UI 즉시 반영(비영속)
          setOptimisticAdded((prev) => (prev.includes(n) ? prev : [...prev, n]));

          // 저장은 상위(API/DB)로 위임
          try {
            await onAddPartnerOption?.(n);
          } finally {
            // 셀 값은 즉시 변경
            onChange(n);
          }
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
    </select>
  );
}