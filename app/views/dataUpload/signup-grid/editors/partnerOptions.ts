// partnerOptions.ts
// 목적: 거래처분류 옵션 목록 정규화 + (필요 시) /api/signup-settings 기반 로드/저장 헬퍼
// 주의: localStorage/sessionStorage/indexedDB 등 브라우저 영속 저장소 사용 금지(규칙 준수)

export function normalizePartnerName(name: unknown): string {
  return String(name ?? "").trim();
}

export function normalizePartnerOptions(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const normalized = list.map((v) => normalizePartnerName(v)).filter(Boolean);
  return Array.from(new Set(normalized));
}

/**
 * 현재 값(value)이 options에 없으면 맨 앞에 포함시켜,
 * 드롭다운/자동완성에서 즉시 선택/표시되도록 한다.
 */
export function mergePartnerOptionsWithValue(options: unknown, value: unknown): string[] {
  const base = normalizePartnerOptions(options);
  const cur = normalizePartnerName(value);

  if (!cur) return base;
  if (base.includes(cur)) return base;
  return [cur, ...base];
}

/**
 * 옵션 리스트에 name을 추가한 "새 리스트"를 반환한다.
 * (실제 DB 저장은 상위 또는 API 헬퍼에서 처리)
 */
export function addPartnerOptionToList(options: unknown, name: unknown): string[] {
  const base = normalizePartnerOptions(options);
  const n = normalizePartnerName(name);
  if (!n) return base;
  if (base.includes(n)) return base;
  return [...base, n];
}

/* ---------------------------
   /api/signup-settings 연동(옵션을 DB에 저장/조회)
   --------------------------- */

type SignupSettingsResponse = {
  selectedKeys?: string[];
  colWidthSteps?: Record<string, number>;
  rowCount?: number;
  partnerOptions?: string[];
};

// 간단 캐시(메모리): 새로고침하면 초기화되며, 규칙 위반 아님
let cachedPartnerOptions: string[] | null = null;
let inflight: Promise<string[]> | null = null;

export async function fetchPartnerOptionsFromApi(): Promise<string[]> {
  if (cachedPartnerOptions) return cachedPartnerOptions;
  if (inflight) return inflight;

  inflight = (async () => {
    const r = await fetch("/api/signup-settings", { cache: "no-store" });
    if (!r.ok) throw new Error(`FAILED(${r.status})`);
    const j = (await r.json()) as SignupSettingsResponse;
    const list = normalizePartnerOptions(j?.partnerOptions);
    cachedPartnerOptions = list;
    return list;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

export async function savePartnerOptionsToApi(nextOptions: string[]): Promise<string[]> {
  const normalized = normalizePartnerOptions(nextOptions);

  const r = await fetch("/api/signup-settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ partnerOptions: normalized }),
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `FAILED(${r.status})`);
  }

  // PATCH 응답이 merged settings이므로 partnerOptions만 다시 정규화
  const j = (await r.json()) as SignupSettingsResponse;
  const saved = normalizePartnerOptions(j?.partnerOptions ?? normalized);

  cachedPartnerOptions = saved;
  return saved;
}

export async function addPartnerOptionViaApi(name: string): Promise<string[]> {
  const n = normalizePartnerName(name);
  if (!n) return cachedPartnerOptions ?? [];

  const cur = await fetchPartnerOptionsFromApi().catch(() => []);
  const next = addPartnerOptionToList(cur, n);

  return await savePartnerOptionsToApi(next);
}