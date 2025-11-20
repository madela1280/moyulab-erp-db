"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { TOP_MENUS } from "@/menus/topMenus";
import { SUB_MENUS } from "@/menus/subMenus";
import { makeRouteKey } from "@/menus/menuRouter";
import { VIEW_MAP } from "@/menus/viewMap";

export default function AppShell() {
  const [top, setTop] = useState<string | null>(null);
  const [sub, setSub] = useState<string | null>(null);
  const [showSub, setShowSub] = useState(false); // 소카테고리 표시 여부

  const CurrentView =
    top && sub ? VIEW_MAP[makeRouteKey(top, sub)] : () => <div />;

  // ⏱ 소카테고리 자동 숨김 타이머
  useEffect(() => {
    if (showSub) {
      const t = setTimeout(() => setShowSub(false), 3000);
      return () => clearTimeout(t);
    }
  }, [showSub]);

  return (
    <div className="min-h-screen bg-gray-50">

      {/* 상단 헤더 */}
      <header className="bg-gray-100 border-b px-6 pt-3 pb-2">
        <div className="flex items-center">
          <Image src="/logo.png" alt="logo" width={36} height={36} />

          <h1 className="text-xl font-bold text-gray-700 ml-3 mr-10">
            Moulab Rental ERP
          </h1>

          {/* 대카테고리 */}
          <nav className="hidden md:flex items-center gap-[2.4rem]">
            {TOP_MENUS.map((m) => (
              <button
                key={m}
                onClick={() => {
                  setTop(m);
                  setShowSub(true);      // 클릭하면 소카테고리 보임
                  setSub(null);          // 아직 소카테고리 선택 안됨
                }}
                className={`text-[0.95rem] font-semibold ${
                  top === m ? "text-black" : "text-gray-700 hover:text-black"
                }`}
              >
                {m}
              </button>
            ))}
          </nav>
        </div>

        {/* 소카테고리 → 대카테고리 아래에 위치 + 클릭/시간 지나면 사라짐 */}
        {top && showSub && (
          <div className="mt-3 flex items-center gap-1">
            {SUB_MENUS[top].map((s) => (
              <button
                key={s}
                onClick={() => {
                  setSub(s);
                  setShowSub(false);   // 소카테고리 클릭하면 바로 숨김
                }}
                className={`px-2 py-0.5 text-xs rounded-full border ${
                  sub === s
                    ? "bg-blue-100 border-blue-300 text-blue-700"
                    : "bg-gray-50 hover:bg-gray-100"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* 메인 화면 */}
      <main className="p-6">
        <CurrentView />
      </main>
    </div>
  );
}





