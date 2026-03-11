"use client";

import { useEffect, useMemo, useState } from "react";

type SettingTab = "분류" | "세팅";
type ClassifyCategory = "거래처분류" | "유축기" | "거래유형" | "가격";

type ListItem = {
  id: number;
  label: string;
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
    const err = new Error(
      (data && (data.error || data.message)) || `HTTP_${res.status}`
    );
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
  return String(v ?? "")
    .trim()
    .replaceAll(",", "")
    .replaceAll(" ", "");
}

function formatAmountLabel(amount: number) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return String(amount ?? "");
  return n.toLocaleString("ko-KR");
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
      <div className={`px-3 py-2 border-b bg-gray-50 ${titleClassName || ""}`}>
        {title}
      </div>

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

        <div className="mt-2">
          {errorText ? (
            <div className="text-xs text-red-600">{errorText}</div>
          ) : null}
        </div>

        <div className="mt-3">
          {items.length === 0 ? (
            <div className="text-xs text-gray-400">
              {loading ? "불러오는 중..." : "등록된 항목 없음"}
            </div>
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

  // 유축기
  const [pumpModels, setPumpModels] = useState<ListItem[]>([]);
  const [pumpLoading, setPumpLoading] = useState(false);
  const [pumpError, setPumpError] = useState<string | null>(null);

  // 거래유형
  const [dealTypes, setDealTypes] = useState<ListItem[]>([]);
  const [dealLoading, setDealLoading] = useState(false);
  const [dealError, setDealError] = useState<string | null>(null);

  // 가격(kind=rent/extend, unit=day)
  const [priceRentDay, setPriceRentDay] = useState<ListItem[]>([]);
  const [priceExtendDay, setPriceExtendDay] = useState<ListItem[]>([]);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);

  async function loadPartnerCategories() {
    setPartnerLoading(true);
    setPartnerError(null);
    try {
      const [r1, r2, r3] = await Promise.all([
        fetchJson(`/api/aggregate/partner-categories?level=1`),
        fetchJson(`/api/aggregate/partner-categories?level=2`),
        fetchJson(`/api/aggregate/partner-categories?level=3`),
      ]);

      setPartnerL1(
        (r1.items || []).map((x: any) => ({
          id: Number(x.id),
          label: String(x.name ?? ""),
        }))
      );
      setPartnerL2(
        (r2.items || []).map((x: any) => ({
          id: Number(x.id),
          label: String(x.name ?? ""),
        }))
      );
      setPartnerL3(
        (r3.items || []).map((x: any) => ({
          id: Number(x.id),
          label: String(x.name ?? ""),
        }))
      );
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
        e?.data?.error === "DUPLICATE_NAME"
          ? "이미 등록된 항목입니다."
          : e?.message || "등록 실패"
      );
      // 실패 시 리로드로 복구(로컬만 바뀐 상태 방지)
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
      setPumpError(e?.message || "불러오기 실패");
    } finally {
      setPumpLoading(false);
    }
  }

  async function addPumpModel(name: string) {
    setPumpError(null);
    try {
      await fetchJson(`/api/aggregate/pump-models`, {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      await loadPumpModels();
    } catch (e: any) {
      setPumpError(
        e?.data?.error === "DUPLICATE_NAME"
          ? "이미 등록된 항목입니다."
          : e?.message || "등록 실패"
      );
      await loadPumpModels().catch(() => {});
    }
  }

  async function deletePumpModel(id: number) {
    setPumpError(null);
    try {
      await fetchJson(`/api/aggregate/pump-models`, {
        method: "DELETE",
        body: JSON.stringify({ id }),
      });
      await loadPumpModels();
    } catch (e: any) {
      setPumpError(e?.message || "삭제 실패");
      await loadPumpModels().catch(() => {});
    }
  }

  async function loadDealTypes() {
    setDealLoading(true);
    setDealError(null);
    try {
      const r = await fetchJson(`/api/aggregate/deal-types`);
      setDealTypes(
        (r.items || []).map((x: any) => ({
          id: Number(x.id),
          label: String(x.name ?? ""),
        }))
      );
    } catch (e: any) {
      setDealError(e?.message || "불러오기 실패");
    } finally {
      setDealLoading(false);
    }
  }

  async function addDealType(name: string) {
    setDealError(null);
    try {
      await fetchJson(`/api/aggregate/deal-types`, {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      await loadDealTypes();
    } catch (e: any) {
      setDealError(
        e?.data?.error === "DUPLICATE_NAME"
          ? "이미 등록된 항목입니다."
          : e?.message || "등록 실패"
      );
      await loadDealTypes().catch(() => {});
    }
  }

  async function deleteDealType(id: number) {
    setDealError(null);
    try {
      await fetchJson(`/api/aggregate/deal-types`, {
        method: "DELETE",
        body: JSON.stringify({ id }),
      });
      await loadDealTypes();
    } catch (e: any) {
      setDealError(e?.message || "삭제 실패");
      await loadDealTypes().catch(() => {});
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

  async function reloadForCurrent() {
    if (tab !== "분류") return;

    if (category === "거래처분류") {
      await loadPartnerCategories();
    } else if (category === "유축기") {
      await loadPumpModels();
    } else if (category === "거래유형") {
      await loadDealTypes();
    } else if (category === "가격") {
      await loadPrices();
    }
  }

  // 탭/카테고리 진입 시 로드
  useEffect(() => {
    reloadForCurrent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, category]);

  // 간이 동기화: 포커스/가시성 복귀 시 재조회
  useEffect(() => {
    async function onFocus() {
      await reloadForCurrent();
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
  }, [tab, category]);

  return (
    <div className="w-full h-full overflow-auto">
      <div className="px-4 py-3">
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
        <div className="mt-4 border rounded bg-white p-4">
          {tab === "분류" ? (
            <div className="text-sm text-gray-700">
              <div className="font-semibold mb-3">분류</div>

              {/* 분류 4종 버튼 */}
              <div className="flex flex-wrap items-center gap-2 mb-4">
                {(
                  ["거래처분류", "유축기", "거래유형", "가격"] as ClassifyCategory[]
                ).map((c) => (
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
                  <div className="font-semibold text-gray-800 mb-3">
                    거래처분류
                  </div>

                  {/* 3등분(대/중/소) */}
                  <div className="grid grid-cols-3 gap-3">
                    <SimpleRegisterList
                      key="partner-l1"
                      title="대분류"
                      // 거래처분류(기본 1rem) 대비 10% 작게
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
              ) : category === "유축기" ? (
                <div>
                  <div className="font-semibold text-gray-800 mb-3">유축기</div>
                  <div className="max-w-[520px]">
                    <SimpleRegisterList
                      key="pump-models"
                      title="유축기 기종"
                      items={pumpModels}
                      loading={pumpLoading}
                      errorText={pumpError}
                      onAdd={(name) => addPumpModel(name)}
                      onDelete={(id) => deletePumpModel(id)}
                    />
                  </div>
                </div>
              ) : category === "거래유형" ? (
                <div>
                  <div className="font-semibold text-gray-800 mb-3">
                    거래유형
                  </div>
                  <div className="max-w-[520px]">
                    <SimpleRegisterList
                      key="deal-types"
                      title="거래유형"
                      items={dealTypes}
                      loading={dealLoading}
                      errorText={dealError}
                      onAdd={(name) => addDealType(name)}
                      onDelete={(id) => deleteDealType(id)}
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
              ) : (
                <div className="text-xs text-gray-600">
                  <div className="font-semibold text-gray-800 mb-2">
                    {category}
                  </div>
                  <div className="text-gray-500">
                    (준비중) {category} 분류 화면
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-gray-700">
              <div className="font-semibold mb-2">세팅</div>
              <div className="text-xs text-gray-500">(준비중) 세팅 화면</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}