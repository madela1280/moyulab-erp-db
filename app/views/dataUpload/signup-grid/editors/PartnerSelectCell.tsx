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
   * 嫄곕옒泥??듭뀡 紐⑸줉? "?곸쐞(?? SignupView)"?먯꽌 API濡?濡쒕뱶??媛믪쓣 ?대젮以??
   * ??而댄룷?뚰듃 ?대??먯꽌???대뼡 ??μ냼(브라우저저장소(로컬) ?ы븿)???ъ슜?섏? ?딅뒗??
   */
  options: string[];

  /**
   * "+ ?좉퇋嫄곕옒泥?異붽?" ???곸쐞?먯꽌 DB/API ??μ쓣 ?섑뻾?섎룄濡??꾩엫?쒕떎.
   * ?????options 媛깆떊? ?곸쐞 state ?낅뜲?댄듃濡?諛섏쁺?섎뒗 援ъ“瑜?沅뚯옣?쒕떎.
   */
  onAddPartnerOption?: (name: string) => void | Promise<void>;
}) {
  // ?곸쐞 options 媛깆떊 ?꾧퉴吏 UI 利됱떆 諛섏쁺???꾪븳 "?꾩떆(鍮꾩쁺?? ?듭뀡"留?濡쒖뺄 ?곹깭濡?愿由?
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
          const name = prompt("?좉퇋 嫄곕옒泥?嫄곕옒泥섎텇瑜? ?대쫫???낅젰?섏꽭??");
          const n = normalizePartnerName(name);

          if (!n) {
            // 痍⑥냼/鍮덇컪?대㈃ 湲곗〈 媛??좎?(而⑦듃濡ㅻ뱶 媛믪씠誘濡?onChange濡??ъ꽕??
            onChange(String(value ?? ""));
            return;
          }

          // UI 利됱떆 諛섏쁺(鍮꾩쁺??
          setOptimisticAdded((prev) => (prev.includes(n) ? prev : [...prev, n]));

          // ??μ? ?곸쐞(API/DB)濡??꾩엫
          try {
            await onAddPartnerOption?.(n);
          } finally {
            // ? 媛믪? 利됱떆 蹂寃?
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
      <option value="__ADD__">+ ?좉퇋嫄곕옒泥?異붽?...</option>
    </select>
  );
}
