"use client";

import { useState } from "react";

type SettingTab = "분류" | "세팅";
type ClassifyCategory = "거래처분류" | "유축기" | "거래유형" | "가격";

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

              {/* 선택된 분류 화면 placeholder */}
              <div className="text-xs text-gray-600">
                <div className="font-semibold text-gray-800 mb-2">
                  {category}
                </div>
                <div className="text-gray-500">
                  (준비중) {category} 분류 화면
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-700">
              <div className="font-semibold mb-2">세팅</div>
              <div className="text-xs text-gray-500">
                (준비중) 세팅 화면
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}