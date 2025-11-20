"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { TOP_MENUS } from "@/menus/topMenus";
import { SUB_MENUS } from "@/menus/subMenus";
import { makeRouteKey } from "@/menus/menuRouter";
import { VIEW_MAP } from "@/menus/viewMap";

type TopMenu = (typeof TOP_MENUS)[number];
type SubMenu = typeof SUB_MENUS[TopMenu][number];

export default function AppShell() {
  const [top, setTop] = useState<TopMenu | null>(null);
  const [sub, setSub] = useState<SubMenu | null>(null);
  const [showSub, setShowSub] = useState(false);

  const CurrentView =
    top && sub ? VIEW_MAP[makeRouteKey(top, sub)] : () => <div />;

  // 소카테고리 자동 숨김
  useEffect(() => {
    if (showSub) {
      const t = setTimeout(() => setShowSub(false), 3000);
      return () => clearTimeout(t);
    }
  }, [showSub]);

  return (
    <div className="min-h-screen bg-gray-50 w-full">

      {/* 상단 헤더 (가득 채움) */}
      <header className="bg-gray-100 border-b px-10 pt-4 pb-2 w-full">
        <div className="flex items-center justify-between">

          {/* 로고 + 제목 */}
          <div className="flex items-center">
            <Image src="/logo.png" alt="logo" width={40} height={40} />

            <h1 className="text-2xl font-bold text-gray-700 ml-4">
              Moulab Rental ERP
            </h1>
          </div>

          {/* 대카테고리 */}
          <nav className="flex items-center gap-10 text-lg font-semibold">
            {TOP_MENUS.map((m) => (
              <button
                key={m}
                onClick={() => {
                  setTop(m);
                  setSub(SUB_MENUS[m][0]);
                  setShowSub(true);
                }}
                className={top === m ? "text-black" : "text-gray-600 hover:text-black"}
              >
                {m}
              </button>
            ))}
          </nav>
        </div>

        {/* ⛔ 로고 아래가 아니라 → 대카테고리 바로 아래에 표시되는 소카테고리 */}
        {top && showSub && (
          <div className="mt-3 flex gap-2 px-44">
            {SUB_MENUS[top].map((s) => (
              <button
                key={s}
                onClick={() => {
                  setSub(s);
                  setShowSub(false);
                }}
                className={`px-3 py-1 text-sm rounded-full border ${
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

      {/* 전체 페이지 화면 꽉 채우기 + 좌우 0.5cm 여백 */}
      <main className="px-[0.5cm] py-4 w-full">
        <CurrentView />
      </main>

    </div>
  );
}




