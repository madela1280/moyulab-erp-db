"use client";

import { useEffect, useMemo, useState } from "react";

type SettingTab = "분류" | "세팅";
type ClassifyCategory = "거래처분류" | "가격";

type ListItem = {
  id: number;
  label: string;
};

type SettingPartnerRow = {
  partner_name: string;
  is_configured: boolean;
};

type PumpPriceLine = {
  pump_model_id: number | null;
  rent_day_price_id: number | null;
  extend_day_price_id: number | null;
};

type PartnerSettingsForm = {
  partner_name: string;
  partner_cat_l1_id: number | null;
  partner_cat_l2_id: number | null;
  partner_cat_l3_id: number | null;

  // ✅ 기존(기본값)도 유지
  rent_day_price_id: number | null;
  extend_day_price_id: number | null;

  // ✅ 추가: 유축기별 단가(여러 줄)
  pump_prices: PumpPriceLine[];
};

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const err = new Error((data && (data.error || data.message)) || `HTTP_${res.status}`);
    (err as any).status = res.status;
    (err as any).data = data;
    throw err;
  }

  return data;
}

function normalizeName(v: string) {
  return String(v ?? "").trim();
}

function normalizeAmountInput(v: string) {
  // "10,000" or " 10000 " -> "10000"
  return String(v ?? "").trim().replaceAll(",", "").replaceAll(" ", "");
}

function formatAmountLabel(amount: number) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return String(amount ?? "");
  return n.toLocaleString("ko-KR");
}

function emptyPumpLine(): PumpPriceLine {
  return { pump_model_id: null, rent_day_price_id: null, extend_day_price_id: null };
}

function isPumpLineEmpty(x: PumpPriceLine | null | undefined) {
  if (!x) return true;
  return x.pump_model_id == null && x.rent_day_price_id == null && x.extend_day_price_id == null;
}

// ✅ 항상 "마지막에 빈 줄 1개"만 유지
function normalizePumpLines(input: PumpPriceLine[]) {
  const base = Array.isArray(input) ? input : [];
  const nonEmpty = base.filter((x) => !isPumpLineEmpty(x));
  return [...nonEmpty, emptyPumpLine()];
}

// ✅ 저장용 정규화: pump_model_id가 있는 줄만 보내되, price는 null 허용(=삭제 의미)
function normalizePumpLinesForSave(input: PumpPriceLine[]) {
  const base = Array.isArray(input) ? input : [];

  // pump_model_id 없는 줄은 버림(마지막 빈줄 등)
  const filtered = base
    .map((x) => ({
      pump_model_id: x?.pump_model_id ?? null,
      rent_day_price_id: x?.rent_day_price_id ?? null,
      extend_day_price_id: x?.extend_day_price_id ?? null,
    }))
    .filter((x) => x.pump_model_id != null);

  // 같은 pump_model_id가 중복되면 마지막 값이 최종이 되도록 덮어쓰기
  const map = new Map<number, PumpPriceLine>();
  for (const x of filtered) map.set(Number(x.pump_model_id), x);

  return Array.from(map.values());
}

function SimpleRegisterList(props: {
  title: string;
  titleClassName?: string;
  items: ListItem[];
  placeholder?: string;
  addButtonText?: string;
  normalizeInput?: (v: string) => string;
  onAdd: (value: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  loading?: boolean;
  errorText?: string | null;
}) {
  const {
    title,
    titleClassName,
    items,
    placeholder,
    addButtonText,
    normalizeInput,
    onAdd,
    onDelete,
    loading,
    errorText,
  } = props;

  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const normalized = useMemo(() => {
    const base = value;
    const v = normalizeInput ? normalizeInput(base) : normalizeName(base);
    return v;
  }, [value, normalizeInput]);

  async function addItem() {
    const v = normalized;
    if (!v) return;

    setBusy(true);
    try {
      await onAdd(v);
      setValue("");
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(id: number) {
    setBusy(true);
    try {
      await onDelete(id);
    } finally {
      setBusy(false);
    }
  }

  const disabled = !!loading || busy;

  return (
    <div className="border rounded bg-white">
      <div className={`px-3 py-2 border-b bg-gray-50 ${titleClassName || ""}`}>{title}</div>

      <div className="p-3">
        <div className="flex items-center gap-2">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addItem();
            }}
            placeholder={placeholder || `${title} 등록`}
            className="flex-1 border rounded px-2 py-1 text-sm"
            disabled={disabled}
          />
          <button
            type="button"
            onClick={addItem}
            disabled={disabled}
            className={`px-3 py-1 text-sm rounded border bg-blue-600 text-white border-blue-600 hover:bg-blue-700 ${
              disabled ? "opacity-60 cursor-not-allowed" : ""
            }`}
          >
            {addButtonText || "등록"}
          </button>
        </div>

        <div className="mt-2">{errorText ? <div className="text-xs text-red-600">{errorText}</div> : null}</div>

        <div className="mt-3">
          {items.length === 0 ? (
            <div className="text-xs text-gray-400">{loading ? "불러오는 중..." : "등록된 항목 없음"}</div>
          ) : (
            <ul className="text-sm">
              {items.map((it) => (
                <li
                  key={it.id}
                  className="flex items-center justify-between gap-2 py-1 border-b last:border-b-0"
                >
                  <span className="truncate">{it.label}</span>
                  <button
                    type="button"
                    onClick={() => removeItem(it.id)}
                    disabled={disabled}
                    className={`px-2 py-0.5 text-xs rounded border bg-white hover:bg-gray-50 ${
                      disabled ? "opacity-60 cursor-not-allowed" : ""
                    }`}
                  >
                    삭제
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AggregateSettingView() {
  const [tab, setTab] = useState<SettingTab>("분류");
  const [category, setCategory] = useState<ClassifyCategory>("거래처분류");

  // 거래처분류(level 1/2/3)
  const [partnerL1, setPartnerL1] = useState<ListItem[]>([]);
  const [partnerL2, setPartnerL2] = useState<ListItem[]>([]);
  const [partnerL3, setPartnerL3] = useState<ListItem[]>([]);
  const [partnerLoading, setPartnerLoading] = useState(false);
  const [partnerError, setPartnerError] = useState<string | null>(null);

  // 가격(kind=rent/extend, unit=day)
  const [priceRentDay, setPriceRentDay] = useState<ListItem[]>([]);
  const [priceExtendDay, setPriceExtendDay] = useState<ListItem[]>([]);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);

  // ✅ 유축기 모델(선택 목록 + 직접추가)
  const [pumpModels, setPumpModels] = useState<ListItem[]>([]);
  const [pumpLoading, setPumpLoading] = useState(false);
  const [pumpError, setPumpError] = useState<string | null>(null);

  // 세팅 탭(좌측 거래처 목록 + 우측 설정 폼)
  const [settingPartners, setSettingPartners] = useState<SettingPartnerRow[]>([]);
  const [settingPartnersLoading, setSettingPartnersLoading] = useState(false);
  const [settingPartnersError, setSettingPartnersError] = useState<string | null>(null);

  const [selectedPartnerName, setSelectedPartnerName] = useState<string>("");

  const [settingsForm, setSettingsForm] = useState<PartnerSettingsForm | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaveError, setSettingsSaveError] = useState<string | null>(null);

  // 유축기 추가 입력
  const [newPumpName, setNewPumpName] = useState<string>("");
  const [newPumpBusy, setNewPumpBusy] = useState<boolean>(false);

  async function loadSettingPartners() {
    setSettingPartnersLoading(true);
    setSettingPartnersError(null);
    try {
      const r = await fetchJson(`/api/aggregate/partners`);
      setSettingPartners(
        (r.partners || []).map((x: any) => ({
          partner_name: String(x.partner_name ?? "").trim(),
          is_configured: !!x.is_configured,
        }))
      );
    } catch (e: any) {
      setSettingPartnersError(e?.message || "목록 로드 실패");
    } finally {
      setSettingPartnersLoading(false);
    }
  }

  async function loadPartnerSettings(partnerName: string) {
    const name = String(partnerName ?? "").trim();
    if (!name) {
      setSettingsForm(null);
      return;
    }

    setSettingsLoading(true);
    setSettingsError(null);
    try {
      const r = await fetchJson(`/api/aggregate/partner-settings?partner_name=${encodeURIComponent(name)}`);

      const s = r?.settings;
      const pumpPricesRaw = Array.isArray(r?.pump_prices) ? r.pump_prices : [];

      const pumpLines: PumpPriceLine[] = pumpPricesRaw.map((x: any) => ({
        pump_model_id: x?.pump_model_id == null ? null : Number(x.pump_model_id),
        rent_day_price_id: x?.rent_day_price_id == null ? null : Number(x.rent_day_price_id),
        extend_day_price_id: x?.extend_day_price_id == null ? null : Number(x.extend_day_price_id),
      }));

      setSettingsForm({
        partner_name: name,
        partner_cat_l1_id: s?.partner_cat_l1_id ?? null,
        partner_cat_l2_id: s?.partner_cat_l2_id ?? null,
        partner_cat_l3_id: s?.partner_cat_l3_id ?? null,
        rent_day_price_id: s?.rent_day_price_id ?? null,
        extend_day_price_id: s?.extend_day_price_id ?? null,
        pump_prices: normalizePumpLines(pumpLines),
      });
    } catch (e: any) {
      setSettingsError(e?.message || "설정 로드 실패");
      setSettingsForm({
        partner_name: name,
        partner_cat_l1_id: null,
        partner_cat_l2_id: null,
        partner_cat_l3_id: null,
        rent_day_price_id: null,
        extend_day_price_id: null,
        pump_prices: normalizePumpLines([]),
      });
    } finally {
      setSettingsLoading(false);
    }
  }

  async function savePartnerSettings() {
    if (!settingsForm?.partner_name) return;

    setSettingsSaving(true);
    setSettingsSaveError(null);

    try {
      const payload = {
        ...settingsForm,
        pump_prices: normalizePumpLinesForSave(settingsForm.pump_prices),
      };

      await fetchJson(`/api/aggregate/partner-settings`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      // 저장 성공 후 좌측 상태 갱신 + 우측 재로딩
      await loadSettingPartners();
      await loadPartnerSettings(settingsForm.partner_name);
    } catch (e: any) {
      setSettingsSaveError(e?.message || "저장 실패");
      // 실패 시에도 최신값으로 복구(재조회)
      await loadPartnerSettings(settingsForm.partner_name).catch(() => {});
      await loadSettingPartners().catch(() => {});
    } finally {
      setSettingsSaving(false);
    }
  }

  async function loadPartnerCategories() {
    setPartnerLoading(true);
    setPartnerError(null);
    try {
      const [r1, r2, r3] = await Promise.all([
        fetchJson(`/api/aggregate/partner-categories?level=1`),
        fetchJson(`/api/aggregate/partner-categories?level=2`),
        fetchJson(`/api/aggregate/partner-categories?level=3`),
      ]);

      setPartnerL1((r1.items || []).map((x: any) => ({ id: Number(x.id), label: String(x.name ?? "") })));
      setPartnerL2((r2.items || []).map((x: any) => ({ id: Number(x.id), label: String(x.name ?? "") })));
      setPartnerL3((r3.items || []).map((x: any) => ({ id: Number(x.id), label: String(x.name ?? "") })));
    } catch (e: any) {
      setPartnerError(e?.message || "불러오기 실패");
    } finally {
      setPartnerLoading(false);
    }
  }

  async function addPartnerCategory(level: 1 | 2 | 3, name: string) {
    setPartnerError(null);
    try {
      await fetchJson(`/api/aggregate/partner-categories`, {
        method: "POST",
        body: JSON.stringify({ level, name }),
      });
      await loadPartnerCategories();
    } catch (e: any) {
      setPartnerError(
        e?.data?.error === "DUPLICATE_NAME" ? "이미 등록된 항목입니다." : e?.message || "등록 실패"
      );
      await loadPartnerCategories().catch(() => {});
    }
  }

  async function deletePartnerCategory(id: number) {
    setPartnerError(null);
    try {
      await fetchJson(`/api/aggregate/partner-categories`, {
        method: "DELETE",
        body: JSON.stringify({ id }),
      });
      await loadPartnerCategories();
    } catch (e: any) {
      setPartnerError(e?.message || "삭제 실패");
      await loadPartnerCategories().catch(() => {});
    }
  }

  async function loadPrices() {
    setPriceLoading(true);
    setPriceError(null);
    try {
      const [rent, extend] = await Promise.all([
        fetchJson(`/api/aggregate/prices?kind=rent&unit=day`),
        fetchJson(`/api/aggregate/prices?kind=extend&unit=day`),
      ]);

      setPriceRentDay(
        (rent.items || []).map((x: any) => ({
          id: Number(x.id),
          label: formatAmountLabel(Number(x.amount ?? 0)),
        }))
      );
      setPriceExtendDay(
        (extend.items || []).map((x: any) => ({
          id: Number(x.id),
          label: formatAmountLabel(Number(x.amount ?? 0)),
        }))
      );
    } catch (e: any) {
      setPriceError(e?.message || "불러오기 실패");
    } finally {
      setPriceLoading(false);
    }
  }

  async function addPrice(kind: "rent" | "extend", amountRaw: string) {
    setPriceError(null);
    try {
      const cleaned = normalizeAmountInput(amountRaw);
      await fetchJson(`/api/aggregate/prices`, {
        method: "POST",
        body: JSON.stringify({ kind, unit: "day", amount: cleaned }),
      });
      await loadPrices();
    } catch (e: any) {
      setPriceError(
        e?.data?.error === "DUPLICATE_PRICE"
          ? "이미 등록된 금액입니다."
          : e?.data?.error === "INVALID_AMOUNT"
          ? "금액을 숫자로 입력해 주세요."
          : e?.message || "등록 실패"
      );
      await loadPrices().catch(() => {});
    }
  }

  async function deletePrice(id: number) {
    setPriceError(null);
    try {
      await fetchJson(`/api/aggregate/prices`, {
        method: "DELETE",
        body: JSON.stringify({ id }),
      });
      await loadPrices();
    } catch (e: any) {
      setPriceError(e?.message || "삭제 실패");
      await loadPrices().catch(() => {});
    }
  }

  async function loadPumpModels() {
    setPumpLoading(true);
    setPumpError(null);
    try {
      const r = await fetchJson(`/api/aggregate/pump-models`);
      setPumpModels(
        (r.items || []).map((x: any) => ({
          id: Number(x.id),
          label: String(x.name ?? ""),
        }))
      );
    } catch (e: any) {
      setPumpError(e?.message || "유축기 목록 로드 실패");
    } finally {
      setPumpLoading(false);
    }
  }

  async function addPumpModel(nameRaw: string) {
    const name = normalizeName(nameRaw);
    if (!name) return;

    setNewPumpBusy(true);
    setPumpError(null);
    try {
      await fetchJson(`/api/aggregate/pump-models`, {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setNewPumpName("");
      await loadPumpModels();
    } catch (e: any) {
      setPumpError(
        e?.data?.error === "DUPLICATE_NAME"
          ? "이미 등록된 유축기입니다."
          : e?.message || "유축기 추가 실패"
      );
      await loadPumpModels().catch(() => {});
    } finally {
      setNewPumpBusy(false);
    }
  }

  async function reloadForCurrent() {
    if (tab !== "분류") return;

    if (category === "거래처분류") {
      await loadPartnerCategories();
    } else if (category === "가격") {
      await loadPrices();
    }
  }

  // 탭/카테고리 진입 시 로드
  useEffect(() => {
    reloadForCurrent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, category]);

  // 세팅 탭 진입 시: 좌측 목록 + 옵션(분류 데이터) 로드
  useEffect(() => {
    if (tab !== "세팅") return;

    loadSettingPartners();
    loadPartnerCategories();
    loadPrices();
    loadPumpModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // 세팅 탭에서 거래처 선택 시: 해당 거래처 설정 로드
  useEffect(() => {
    if (tab !== "세팅") return;

    if (!selectedPartnerName) {
      setSettingsForm(null);
      return;
    }

    loadPartnerSettings(selectedPartnerName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selectedPartnerName]);

  // 간이 동기화: 포커스/가시성 복귀 시 재조회
  useEffect(() => {
    async function onFocus() {
      await reloadForCurrent();

      if (tab === "세팅") {
        await loadSettingPartners();
        await loadPumpModels();
        if (selectedPartnerName) {
          await loadPartnerSettings(selectedPartnerName);
        }
      }
    }
    function onVisibility() {
      if (document.visibilityState === "visible") {
        onFocus();
      }
    }

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, category, selectedPartnerName]);

  function updatePumpLine(index: number, patch: Partial<PumpPriceLine>) {
    setSettingsForm((prev) => {
      if (!prev) return prev;

      const cur = Array.isArray(prev.pump_prices) ? prev.pump_prices : [emptyPumpLine()];
      const next = cur.slice();
      const base = next[index] ?? emptyPumpLine();
      next[index] = { ...base, ...patch };

      return {
        ...prev,
        pump_prices: normalizePumpLines(next),
      };
    });
  }

  function deletePumpLine(index: number) {
    setSettingsForm((prev) => {
      if (!prev) return prev;

      const cur = Array.isArray(prev.pump_prices) ? prev.pump_prices : [];
      const next = cur.filter((_, i) => i !== index);
      return { ...prev, pump_prices: normalizePumpLines(next) };
    });
  }

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <div className="px-4 py-3 flex-1 min-h-0 flex flex-col">
        {/* 상단 탭 */}
        <div className="flex items-center gap-2 border-b pb-2">
          <button
            type="button"
            onClick={() => setTab("분류")}
            className={`px-3 py-1.5 text-sm rounded-t border ${
              tab === "분류"
                ? "bg-white border-gray-300 border-b-white font-semibold"
                : "bg-gray-50 border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            분류
          </button>
          <button
            type="button"
            onClick={() => setTab("세팅")}
            className={`px-3 py-1.5 text-sm rounded-t border ${
              tab === "세팅"
                ? "bg-white border-gray-300 border-b-white font-semibold"
                : "bg-gray-50 border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            세팅
          </button>
        </div>

        {/* 본문 */}
        <div className="mt-4 border rounded bg-white p-4 flex-1 min-h-0">
          {tab === "분류" ? (
            <div className="text-sm text-gray-700">
              <div className="font-semibold mb-3">분류</div>

              {/* 분류 버튼 */}
              <div className="flex flex-wrap items-center gap-2 mb-4">
                {(["거래처분류", "가격"] as ClassifyCategory[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={`px-3 py-1.5 text-sm rounded border ${
                      category === c
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>

              {/* 선택된 분류 화면 */}
              {category === "거래처분류" ? (
                <div>
                  <div className="font-semibold text-gray-800 mb-3">거래처분류</div>

                  {/* 3등분(대/중/소) */}
                  <div className="grid grid-cols-3 gap-3">
                    <SimpleRegisterList
                      key="partner-l1"
                      title="대분류"
                      titleClassName="text-[0.9rem] font-semibold text-gray-700"
                      items={partnerL1}
                      loading={partnerLoading}
                      errorText={partnerError}
                      onAdd={(name) => addPartnerCategory(1, name)}
                      onDelete={(id) => deletePartnerCategory(id)}
                    />
                    <SimpleRegisterList
                      key="partner-l2"
                      title="중분류"
                      titleClassName="text-[0.9rem] font-semibold text-gray-700"
                      items={partnerL2}
                      loading={partnerLoading}
                      errorText={partnerError}
                      onAdd={(name) => addPartnerCategory(2, name)}
                      onDelete={(id) => deletePartnerCategory(id)}
                    />
                    <SimpleRegisterList
                      key="partner-l3"
                      title="소분류"
                      titleClassName="text-[0.9rem] font-semibold text-gray-700"
                      items={partnerL3}
                      loading={partnerLoading}
                      errorText={partnerError}
                      onAdd={(name) => addPartnerCategory(3, name)}
                      onDelete={(id) => deletePartnerCategory(id)}
                    />
                  </div>
                </div>
              ) : category === "가격" ? (
                <div>
                  <div className="font-semibold text-gray-800 mb-3">가격</div>

                  <div className="grid grid-cols-2 gap-3 max-w-[900px]">
                    <SimpleRegisterList
                      key="price-rent-day"
                      title="대여 일별금액"
                      items={priceRentDay}
                      loading={priceLoading}
                      errorText={priceError}
                      normalizeInput={normalizeAmountInput}
                      onAdd={(amount) => addPrice("rent", amount)}
                      onDelete={(id) => deletePrice(id)}
                    />
                    <SimpleRegisterList
                      key="price-extend-day"
                      title="연장 일별금액"
                      items={priceExtendDay}
                      loading={priceLoading}
                      errorText={priceError}
                      normalizeInput={normalizeAmountInput}
                      onAdd={(amount) => addPrice("extend", amount)}
                      onDelete={(id) => deletePrice(id)}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="text-sm text-gray-700 h-full flex flex-col min-h-0">
              <div className="font-semibold mb-3">세팅</div>

              <div className="flex gap-4 flex-1 min-h-0 items-stretch">
                {/* 좌측(35%): 거래처 목록 */}
                <div className="w-[35%] min-w-[260px] min-h-0 flex flex-col">
                  <div className="border rounded bg-white overflow-hidden flex-1 min-h-0 flex flex-col">
                    <div className="grid grid-cols-[1fr_84px] px-3 py-2 text-xs bg-gray-50 border-b font-semibold text-gray-600">
                      <div>거래처</div>
                      <div className="text-right">상태</div>
                    </div>

                    <div className="flex-1 overflow-auto">
                      {settingPartnersLoading ? (
                        <div className="px-3 py-2 text-xs text-gray-400">불러오는 중...</div>
                      ) : settingPartnersError ? (
                        <div className="px-3 py-2 text-xs text-red-600">{settingPartnersError}</div>
                      ) : settingPartners.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-gray-400">목록 없음</div>
                      ) : (
                        <div>
                          {settingPartners.map((p) => {
                            const active = selectedPartnerName === p.partner_name;
                            return (
                              <button
                                key={p.partner_name}
                                type="button"
                                onClick={() => setSelectedPartnerName(p.partner_name)}
                                className={`w-full grid grid-cols-[1fr_84px] px-3 py-2 text-sm border-b last:border-b-0 hover:bg-gray-50 ${
                                  active ? "bg-blue-50" : "bg-white"
                                }`}
                              >
                                <div className="truncate text-left">{p.partner_name}</div>
                                <div
                                  className={`text-right text-xs ${
                                    p.is_configured ? "text-green-700" : "text-gray-500"
                                  }`}
                                >
                                  {p.is_configured ? "설정" : "미설정"}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 우측(65%): 설정 폼 */}
                <div className="flex-1 w-[65%] min-w-0">
                  <div className="border rounded bg-white p-4">
                    {!selectedPartnerName ? (
                      <div className="text-xs text-gray-500">좌측에서 거래처를 선택해 주세요.</div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <div className="font-semibold text-gray-800 truncate">{selectedPartnerName}</div>

                          <button
                            type="button"
                            onClick={savePartnerSettings}
                            disabled={settingsSaving || settingsLoading || !settingsForm}
                            className={`px-3 py-1.5 text-sm rounded border bg-blue-600 text-white border-blue-600 hover:bg-blue-700 ${
                              settingsSaving || settingsLoading || !settingsForm
                                ? "opacity-60 cursor-not-allowed"
                                : ""
                            }`}
                          >
                            저장
                          </button>
                        </div>

                        {settingsLoading ? (
                          <div className="text-xs text-gray-400">불러오는 중...</div>
                        ) : settingsError ? (
                          <div className="text-xs text-red-600">{settingsError}</div>
                        ) : null}

                        {settingsSaveError ? (
                          <div className="mt-2 text-xs text-red-600">{settingsSaveError}</div>
                        ) : null}

                        {/* ✅ 유축기 추가 입력 */}
                        <div className="mt-2 border rounded bg-gray-50 p-3">
                          <div className="text-xs font-semibold text-gray-700 mb-2">유축기 추가(선택 목록 확장)</div>
                          <div className="flex items-center gap-2">
                            <input
                              value={newPumpName}
                              onChange={(e) => setNewPumpName(e.target.value)}
                              placeholder="예: 프리스타일"
                              className="flex-1 border rounded px-2 py-1 text-sm bg-white"
                              disabled={pumpLoading || newPumpBusy}
                            />
                            <button
                              type="button"
                              className={`px-3 py-1 text-sm rounded border bg-white hover:bg-gray-100 ${
                                pumpLoading || newPumpBusy ? "opacity-60 cursor-not-allowed" : ""
                              }`}
                              disabled={pumpLoading || newPumpBusy}
                              onClick={() => void addPumpModel(newPumpName)}
                            >
                              추가
                            </button>
                            <button
                              type="button"
                              className={`px-3 py-1 text-sm rounded border bg-white hover:bg-gray-100 ${
                                pumpLoading ? "opacity-60 cursor-not-allowed" : ""
                              }`}
                              disabled={pumpLoading}
                              onClick={() => void loadPumpModels()}
                            >
                              새로고침
                            </button>
                          </div>
                          {pumpError ? <div className="mt-2 text-xs text-red-600">{pumpError}</div> : null}
                          {pumpLoading ? <div className="mt-2 text-xs text-gray-400">유축기 목록 로딩 중...</div> : null}
                        </div>

                        {settingsForm ? (
                          <div className="mt-3 space-y-3">
                            {/* 1줄: 대/중/소 */}
                            <div className="grid grid-cols-3 gap-3">
                              <div>
                                <div className="text-xs text-gray-600 mb-1">대분류</div>
                                <select
                                  className="w-full border rounded px-2 py-1 text-sm bg-white"
                                  value={settingsForm.partner_cat_l1_id ?? ""}
                                  onChange={(e) =>
                                    setSettingsForm((prev) =>
                                      prev
                                        ? {
                                            ...prev,
                                            partner_cat_l1_id: e.target.value ? Number(e.target.value) : null,
                                          }
                                        : prev
                                    )
                                  }
                                >
                                  <option value="">(선택)</option>
                                  {partnerL1.map((x) => (
                                    <option key={x.id} value={x.id}>
                                      {x.label}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <div className="text-xs text-gray-600 mb-1">중분류</div>
                                <select
                                  className="w-full border rounded px-2 py-1 text-sm bg-white"
                                  value={settingsForm.partner_cat_l2_id ?? ""}
                                  onChange={(e) =>
                                    setSettingsForm((prev) =>
                                      prev
                                        ? {
                                            ...prev,
                                            partner_cat_l2_id: e.target.value ? Number(e.target.value) : null,
                                          }
                                        : prev
                                    )
                                  }
                                >
                                  <option value="">(선택)</option>
                                  {partnerL2.map((x) => (
                                    <option key={x.id} value={x.id}>
                                      {x.label}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <div className="text-xs text-gray-600 mb-1">소분류</div>
                                <select
                                  className="w-full border rounded px-2 py-1 text-sm bg-white"
                                  value={settingsForm.partner_cat_l3_id ?? ""}
                                  onChange={(e) =>
                                    setSettingsForm((prev) =>
                                      prev
                                        ? {
                                            ...prev,
                                            partner_cat_l3_id: e.target.value ? Number(e.target.value) : null,
                                          }
                                        : prev
                                    )
                                  }
                                >
                                  <option value="">(선택)</option>
                                  {partnerL3.map((x) => (
                                    <option key={x.id} value={x.id}>
                                      {x.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            {/* 2줄: 기본 가격(대여/연장) - 기존 유지 */}
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <div className="text-xs text-gray-600 mb-1">대여 일별금액(기본)</div>
                                <select
                                  className="w-full border rounded px-2 py-1 text-sm bg-white"
                                  value={settingsForm.rent_day_price_id ?? ""}
                                  onChange={(e) =>
                                    setSettingsForm((prev) =>
                                      prev
                                        ? {
                                            ...prev,
                                            rent_day_price_id: e.target.value ? Number(e.target.value) : null,
                                          }
                                        : prev
                                    )
                                  }
                                >
                                  <option value="">(선택)</option>
                                  {priceRentDay.map((x) => (
                                    <option key={x.id} value={x.id}>
                                      {x.label}원
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <div className="text-xs text-gray-600 mb-1">연장 일별금액(기본)</div>
                                <select
                                  className="w-full border rounded px-2 py-1 text-sm bg-white"
                                  value={settingsForm.extend_day_price_id ?? ""}
                                  onChange={(e) =>
                                    setSettingsForm((prev) =>
                                      prev
                                        ? {
                                            ...prev,
                                            extend_day_price_id: e.target.value ? Number(e.target.value) : null,
                                          }
                                        : prev
                                    )
                                  }
                                >
                                  <option value="">(선택)</option>
                                  {priceExtendDay.map((x) => (
                                    <option key={x.id} value={x.id}>
                                      {x.label}원
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            {/* ✅ 3줄+: 유축기별 가격(여러 줄) */}
                            <div className="border rounded p-3 bg-white">
                              <div className="text-xs font-semibold text-gray-700 mb-2">
                                유축기별 일별금액(여러 줄)
                              </div>

                              <div className="grid grid-cols-[220px_1fr_1fr_64px] gap-2 text-[11px] font-semibold text-gray-600 mb-2">
                                <div>유축기</div>
                                <div>대여 일별금액</div>
                                <div>연장 일별금액</div>
                                <div className="text-right">삭제</div>
                              </div>

                              <div className="space-y-2">
                                {(settingsForm.pump_prices || [emptyPumpLine()]).map((line, idx) => {
                                  const isLast = idx === (settingsForm.pump_prices?.length ?? 1) - 1;
                                  const canDelete = !isLast && !isPumpLineEmpty(line);

                                  return (
                                    <div
                                      key={`${idx}-${line.pump_model_id ?? "x"}`}
                                      className="grid grid-cols-[220px_1fr_1fr_64px] gap-2 items-center"
                                    >
                                      <select
                                        className="w-full border rounded px-2 py-1 text-sm bg-white"
                                        value={line.pump_model_id ?? ""}
                                        onChange={(e) =>
                                          updatePumpLine(idx, {
                                            pump_model_id: e.target.value ? Number(e.target.value) : null,
                                          })
                                        }
                                      >
                                        <option value="">(선택)</option>
                                        {pumpModels.map((x) => (
                                          <option key={x.id} value={x.id}>
                                            {x.label}
                                          </option>
                                        ))}
                                      </select>

                                      <select
                                        className="w-full border rounded px-2 py-1 text-sm bg-white"
                                        value={line.rent_day_price_id ?? ""}
                                        onChange={(e) =>
                                          updatePumpLine(idx, {
                                            rent_day_price_id: e.target.value ? Number(e.target.value) : null,
                                          })
                                        }
                                      >
                                        <option value="">(선택)</option>
                                        {priceRentDay.map((x) => (
                                          <option key={x.id} value={x.id}>
                                            {x.label}원
                                          </option>
                                        ))}
                                      </select>

                                      <select
                                        className="w-full border rounded px-2 py-1 text-sm bg-white"
                                        value={line.extend_day_price_id ?? ""}
                                        onChange={(e) =>
                                          updatePumpLine(idx, {
                                            extend_day_price_id: e.target.value ? Number(e.target.value) : null,
                                          })
                                        }
                                      >
                                        <option value="">(선택)</option>
                                        {priceExtendDay.map((x) => (
                                          <option key={x.id} value={x.id}>
                                            {x.label}원
                                          </option>
                                        ))}
                                      </select>

                                      <div className="text-right">
                                        <button
                                          type="button"
                                          className={`px-2 py-1 text-xs rounded border bg-white hover:bg-gray-50 ${
                                            canDelete ? "" : "opacity-40 cursor-not-allowed"
                                          }`}
                                          disabled={!canDelete}
                                          onClick={() => deletePumpLine(idx)}
                                        >
                                          삭제
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>

                              <div className="mt-2 text-[11px] text-gray-500">
                                마지막 줄은 자동으로 유지됩니다(한 줄이 채워지면 다음 빈 줄이 자동 생성).
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
