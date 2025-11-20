"use client";

import Image from "next/image";
import { useState } from "react";
import { TOP_MENUS } from "@/menus/topMenus";
import { SUB_MENUS } from "@/menus/subMenus";
import { makeRouteKey } from "@/menus/menuRouter";
import { VIEW_MAP } from "@/menus/viewMap";

type TopMenu = (typeof TOP_MENUS)[number];
type SubMenu = typeof SUB_MENUS[TopMenu][number];

export default function AppShell() {
  const [top, setTop] = useState<TopMenu>("통합관리");
  const [sub, setSub] = useState<SubMenu>(SUB_MENUS["통합관리"][0]);
  const [showSub, setShowSub] = useState(false);

  const CurrentView = VIEW_MAP[makeRouteKey(top, sub)];

  return (
    <div className="min-h-screen w-full">

      {/* 상단 헤더 */}
      <header className="bg-gray-100 border-b w-full px-8 py-3">

        {/* 로고 + 제목 + 대카테고리 한 줄 정렬 */}
        <div className="flex items-center justify-between w-full">

          {/* 왼쪽 : 로고 + 제목 */}
          <div className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="logo"
              width={36}     // 30% 축소
              height={36}
            />
            <h1 className="text-[1.2rem] font-bold text-gray-700">
              {/* 20% 축소 */}
              Moulab Rental ERP
            </h1>
          </div>

          {/* 오른쪽 : 대카테고리 */}
          <nav className="flex items-center gap-8 text-[1rem] font-semibold text-black">
            {TOP_MENUS.map((m) => (
              <button
                key={m}
                onClick={() => {
                  setTop(m);
                  setSub(SUB_MENUS[m][0]);
                  setShowSub(true); // 클릭 시 소카테고리 표시
                }}
                className={
                  top === m
                    ? "pb-1 border-b-2 border-black"
                    : "text-gray-600 hover:text-black"
                }
              >
                {m}
              </button>
            ))}
          </nav>

        </div>

        {/* 소카테고리 (대카테고리 바로 아래 표시) */}
        {showSub && (
          <div className="flex gap-2 mt-3 pl-[70px]"> 
            {SUB_MENUS[top].map((s) => (
              <button
                key={s}
                onClick={() => {
                  setSub(s);
                  setShowSub(false);
                }}
                className={`px-4 py-1 text-sm rounded-full border ${
                  sub === s
                    ? "bg-blue-100 border-blue-300 text-blue-700"
                    : "bg-white hover:bg-gray-100"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}

      </header>

      {/* 메인 화면 */}
      <main className="px-4 py-4 w-full">
        <CurrentView />
      </main>
    </div>
  );
}
