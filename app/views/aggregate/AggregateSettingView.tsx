"use client";

import { useMemo, useState } from "react";

type SettingTab = "분류" | "세팅";
type ClassifyCategory = "거래처분류" | "유축기" | "거래유형" | "가격";

function SimpleRegisterList(props: { title: string; titleClassName?: string }) {
  const { title, titleClassName } = props;
  const [items, setItems] = useState<string[]>([]);
  const [value, setValue] = useState("");

  const normalized = useMemo(() => value.trim(), [value]);

  function addItem() {
    const v = normalized;
    if (!v) return;
    setItems((prev) => {
      if (prev.includes(v)) return prev;
      return [...prev, v];
    });
    setValue("");
  }

  function removeItem(v: string) {
    setItems((prev) => prev.filter((x) => x !== v));
  }

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
            placeholder={`${title} 등록`}
            className="flex-1 border rounded px-2 py-1 text-sm"
          />
          <button
            type="button"
            onClick={addItem}
            className="px-3 py-1 text-sm rounded border bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
          >
            등록
          </button>
        </div>

        <div className="mt-3">
          {items.length === 0 ? (
            <div className="text-xs text-gray-400">등록된 항목 없음</div>
          ) : (
            <ul className="text-sm">
              {items.map((it) => (
                <li
                  key={it}
                  className="flex items-center justify-between gap-2 py-1 border-b last:border-b-0"
                >
                  <span className="truncate">{it}</span>
                  <button
                    type="button"
                    onClick={() => removeItem(it)}
                    className="px-2 py-0.5 text-xs rounded border bg-white hover:bg-gray-50"
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
                    />
                    <SimpleRegisterList
                      key="partner-l2"
                      title="중분류"
                      titleClassName="text-[0.9rem] font-semibold text-gray-700"
                    />
                    <SimpleRegisterList
                      key="partner-l3"
                      title="소분류"
                      titleClassName="text-[0.9rem] font-semibold text-gray-700"
                    />
                  </div>
                </div>
              ) : category === "유축기" ? (
                <div>
                  <div className="font-semibold text-gray-800 mb-3">유축기</div>
                  <div className="max-w-[520px]">
                  <SimpleRegisterList key="pump-models" title="유축기 기종" />
                  </div>
                </div>
              ) : category === "거래유형" ? (
                <div>
                  <div className="font-semibold text-gray-800 mb-3">
                    거래유형
                  </div>
                  <div className="max-w-[520px]">
                   <SimpleRegisterList key="deal-types" title="거래유형" />
                  </div>
                </div>
              ) : category === "가격" ? (
                <div>
                  <div className="font-semibold text-gray-800 mb-3">가격</div>

                  <div className="grid grid-cols-2 gap-3 max-w-[900px]">
                    <SimpleRegisterList
                      key="price-rent-day"
                      title="대여 일별금액"
                    />
                    <SimpleRegisterList
                      key="price-extend-day"
                      title="연장 일별금액"
                    />
                  </div>
                </div>
              ) : (
                <div className="text-xs text-gray-600">
                  <div className="font-semibold text-gray-800 mb-2">
                    {category}
                  </div>
                  <div className="text-gray-500">(준비중) {category} 분류 화면</div>
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