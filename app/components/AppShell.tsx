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

  useEffect(() => {
    if (showSub) {
      const t = setTimeout(() => setShowSub(false), 5000);
      return () => clearTimeout(t);
    }
  }, [showSub]);

  return (
    <div className="min-h-screen bg-gray-50 w-full">

      {/* HEADER */}
      <header className="bg-gray-100 border-b w-full px-8 py-3">

        {/* 전체 헤더를 3줄 구조로 확정 */}
        <div className="flex flex-col">

          {/* 1줄: 로고 + 타이틀 */}
          <div className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="logo"
              width={36}
              height={36}
            />
            <h1 className="text-[1.45rem] font-bold text-gray-800">
              Moulab Rental ERP
            </h1>
          </div>

          {/* 2줄: 대카테고리 (15cm 이동 후 그대로 한 줄 유지) */}
          <nav className="flex items-center gap-8 text-[0.90rem] font-semibold text-gray-700 ml-[15cm] mt-4">
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
                    ? "pb-1 border-b-2 border-gray-800 text-black"
                    : "hover:text-black"
                }
              >
                {m}
              </button>
            ))}
          </nav>

          {/* 3줄: 소카테고리 → 반드시 대카테고리 바로 아래 */}
          {top && showSub && (
            <div className="flex gap-2 mt-2 ml-[15cm]">
              {SUB_MENUS[top].map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setSub(s);
                    setShowSub(false);
                  }}
                  className={`px-3 py-1 text-xs rounded-full border
                    bg-gray-200 border-gray-300 text-gray-700 hover:bg-gray-300
                  `}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

        </div>

      </header>

      {/* 메인 */}
      <main className="px-6 py-4 w-full">
        <CurrentView />
      </main>

    </div>
  );
}



