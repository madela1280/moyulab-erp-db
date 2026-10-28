"use client";

// app/views/marketSales/CoupangTabsView.tsx
//
// "이카운트 > 쿠팡" 화면. 세부카테고리(제이컴퍼니/한모정)를 메뉴 3단계가 아니라
// 화면 안 탭으로 구현한다(AppShell 등 공용 레이아웃 파일을 건드리지 않기 위함).

import { useState } from "react";
import MarketSalesView from "@/views/marketSales/MarketSalesView";
import type { MarketSalesChannel } from "@/views/marketSales/types";

const TABS: { channel: MarketSalesChannel; label: string }[] = [
  { channel: "coupang_jcompany", label: "제이컴퍼니" },
  { channel: "coupang_hanmojeong", label: "한모정" },
];

export default function CoupangTabsView() {
  const [activeChannel, setActiveChannel] = useState<MarketSalesChannel>("coupang_jcompany");

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex items-center gap-1 px-3 pt-2 bg-white border-b border-slate-200">
        {TABS.map((tab) => (
          <button
            key={tab.channel}
            type="button"
            onClick={() => setActiveChannel(tab.channel)}
            className={`px-4 py-1.5 text-sm rounded-t border border-b-0 ${
              activeChannel === tab.channel
                ? "bg-white border-slate-300 text-slate-900 font-semibold"
                : "bg-slate-100 border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        {TABS.map((tab) => (
          <div key={tab.channel} className={activeChannel === tab.channel ? "h-full" : "hidden"}>
            <MarketSalesView channel={tab.channel} title={`쿠팡 - ${tab.label}`} />
          </div>
        ))}
      </div>
    </div>
  );
}
