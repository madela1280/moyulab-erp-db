"use client";

import { useState } from "react";

type SettingTab = "분류" | "세팅";

export default function AggregateSettingView() {
  const [tab, setTab] = useState<SettingTab>("분류");

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
              <div className="font-semibold mb-2">분류</div>
              <div className="text-xs text-gray-500">
                (준비중) 거래처분류 / 유축기 / 거래유형 / 가격 항목을 분류하는 화면이
                여기에 들어갑니다.
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-700">
              <div className="font-semibold mb-2">세팅</div>
              <div className="text-xs text-gray-500">
                (준비중) 분류 기준에 따른 규칙/단가/기간 등의 세팅 화면이 여기에
                들어갑니다.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}