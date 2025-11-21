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

        {/* 첫째줄: 로고 + Moulab + 대카테고리 */}
        <div className="flex items-center justify-between w-full">

          {/* 로고 + 텍스트 */}
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="logo" width={36} height={36} />
            <h1 className="text-[1.45rem] font-bold text-gray-800">Moulab</h1>
          </div>

          {/* 대카테고리 라인 */}
          <nav className="flex items-center gap-10 text-[0.90rem] font-semibold text-gray-700">
            {TOP_MENUS.map((m) => (
              <div key={m} className="relative flex flex-col items-center">

                {/* 대카테고리 버튼 */}
                <button
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

                {/* 소카테고리: 클릭된 메뉴 아래에만 나타남 */}
                {top === m && showSub && (
                  <div className="absolute top-full mt-2 flex gap-2 bg-white px-2 py-1 rounded shadow z-10 border">
                    {SUB_MENUS[m].map((s) => (
                      <button
                        key={s}
                        onClick={() => {
                          setSub(s);
                          setShowSub(false);
                        }}
                        className="px-3 py-1 text-xs rounded-full border bg-gray-200 border-gray-300 text-gray-700 hover:bg-gray-300"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}

              </div>
            ))}
          </nav>
        </div>

      </header>

      {/* MAIN */}
      <main className="px-6 py-4 w-full">
        <CurrentView />
      </main>

    </div>
  );
}



