// partnerOptions.ts
// 紐⑹쟻: "嫄곕옒泥섎텇瑜? ?듭뀡???ㅻ（湲??꾪븳 ?뺢퇋??蹂묓빀 ?좏떥
// 二쇱쓽: 브라우저저장소(로컬) ???대씪?댁뼵????μ냼瑜??덈? ?ъ슜?섏? ?딆쓬 (?뺤콉 以??

export function normalizePartnerName(name: unknown): string {
  return String(name ?? "").trim();
}

export function normalizePartnerOptions(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const normalized = list
    .map((v) => normalizePartnerName(v))
    .filter(Boolean);

  return Array.from(new Set(normalized));
}

/**
 * ?꾩옱 ? 媛?value)??options???놁쑝硫?留??욎뿉 ?ы븿?쒖폒, ?쒕∼?ㅼ슫?먯꽌 利됱떆 ?좏깮/?쒖떆?섎룄濡??쒕떎.
 */
export function mergePartnerOptionsWithValue(options: unknown, value: unknown): string[] {
  const base = normalizePartnerOptions(options);
  const cur = normalizePartnerName(value);

  if (!cur) return base;
  if (base.includes(cur)) return base;
  return [cur, ...base];
}

/**
 * ?듭뀡 由ъ뒪?몄뿉 name??異붽???"??由ъ뒪??瑜?諛섑솚?쒕떎. (??μ? ?곸쐞?먯꽌 API濡?泥섎━)
 */
export function addPartnerOptionToList(options: unknown, name: unknown): string[] {
  const base = normalizePartnerOptions(options);
  const n = normalizePartnerName(name);
  if (!n) return base;
  if (base.includes(n)) return base;
  return [...base, n];
}
