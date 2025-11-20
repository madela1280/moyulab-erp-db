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

  // 소카테고리 자동 숨김 (5초)
  useEffect(() => {
    if (showSub) {
      const t = setTimeout(() => setShowSub(false), 5000);
      return () => clearTimeout(t);
    }
  }, [showSub]);

  return (
    <div className="min-h-screen bg-gray-50 w-full">

      {/* 헤더 전체 영역 */}
      <header className="bg-gray-100 border-b w-full px-10 py-4">

        {/* 1) 로고 + 제목 + 대카테고리  (한 줄) */}
        <div className="flex items-center justify-between w-full">

          {/* 로고 + 제목 */}
          <div className="flex items-center">
            <Image
              src="/logo.png"
              alt="logo"
              width={38}   // 30% 축소
              height={38}
            />
            <h1 className="text-[1.55rem] font-bold text-gray-700 ml-4">
              {/* 5% 확대 */}
              Moulab Rental ERP
            </h1>
          </div>

          {/* 대카테고리 */}
          <nav className="flex items-center gap-10 text-[0.92rem] font-semibold text-gray-700">
            {TOP_MENUS.map((m) => (
              <button
                key={m}
                onClick={() => {
                  setTop(m);
                  setSub(SUB_MENUS[m][0]);
                  setShowSub(true);
                }}
                className={
                  top === m
                    ? "pb-1 border-b-2 border-gray-700 text-black"
                    : "hover:text-black"
                }
              >
                {m}
              </button>
            ))}
          </nav>

        </div>

        {/* 2) 소카테고리 — 대카테고리 바로 아래 */}
        {top && showSub && (
          <div className="flex gap-2 mt-3 ml-auto w-fit">
            {SUB_MENUS[top].map((s) => (
              <button
                key={s}
                onClick={() => {
                  setSub(s);
                  setShowSub(false);
                }}
                className={`px-3 py-1 text-xs rounded-full border ${
                  sub === s
                    ? "bg-blue-100 border-blue-300 text-blue-700"
                    : "bg-gray-50 hover:bg-gray-200"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}

      </header>

      {/* 메인 영역 */}
      <main className="px-[0.5cm] py-4 w-full">
        <CurrentView />
      </main>
    </div>
  );
}

