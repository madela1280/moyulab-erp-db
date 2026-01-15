// partnerOptions.ts
// 목적: "거래처분류" 옵션을 다루기 위한 정규화/병합 유틸
// 주의: localStorage 등 클라이언트 저장소를 절대 사용하지 않음 (정책 준수)

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
 * 현재 셀 값(value)이 options에 없으면 맨 앞에 포함시켜, 드롭다운에서 즉시 선택/표시되도록 한다.
 */
export function mergePartnerOptionsWithValue(options: unknown, value: unknown): string[] {
  const base = normalizePartnerOptions(options);
  const cur = normalizePartnerName(value);

  if (!cur) return base;
  if (base.includes(cur)) return base;
  return [cur, ...base];
}

/**
 * 옵션 리스트에 name을 추가한 "새 리스트"를 반환한다. (저장은 상위에서 API로 처리)
 */
export function addPartnerOptionToList(options: unknown, name: unknown): string[] {
  const base = normalizePartnerOptions(options);
  const n = normalizePartnerName(name);
  if (!n) return base;
  if (base.includes(n)) return base;
  return [...base, n];
}