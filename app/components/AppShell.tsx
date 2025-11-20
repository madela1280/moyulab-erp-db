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

      <header className="bg-gray-100 border-b w-full px-8 py-3">

        {/* 1) 상단 한 줄 */}
        <div className="flex items-center justify-between w-full">

          {/* 로고 + 제목 */}
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

          {/* 대카테고리 */}
          <nav className="flex items-center gap-10 text-[0.82rem] font-semibold text-black ml-[10cm]">
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
        </div>

        {/* 2) 소카테고리 · 정확히 대카테고리 아래 */}
        {top && showSub && (
          <div className="flex gap-2 mt-2 justify-end pr-4">
            {SUB_MENUS[top].map((s) => (
              <button
                key={s}
                onClick={() => {
                  setSub(s);
                  setShowSub(false);
                }}
                className={`px-3 py-1 rounded-full border text-[0.72rem] ${
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

      <main className="px-6 py-4 w-full">
        <CurrentView />
      </main>
    </div>
  );
}


