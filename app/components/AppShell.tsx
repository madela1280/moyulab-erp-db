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
  const [top, setTop] = useState<TopMenu | null>(null);
  const [sub, setSub] = useState<SubMenu | null>(null);
  const [showSub, setShowSub] = useState(false);

  const CurrentView =
    top && sub ? VIEW_MAP[makeRouteKey(top, sub)] : () => <div />;

  return (
    <div className="min-h-screen bg-gray-50 w-full">

      {/* ---------------- 헤더 전체 영역 ---------------- */}
      <header className="bg-gray-100 border-b w-full px-8 pt-4 pb-2">

        {/* ------- 로고 + 제목 영역 ------- */}
        <div className="flex items-center mb-3">

          {/* 로고 30% 축소 → 기존 52 → 36 */}
          <Image
            src="/logo.png"
            alt="logo"
            width={36}
            height={36}
          />

          {/* 제목 20% 축소 → 기존 1.6rem → 1.28rem */}
          <h1 className="text-[1.28rem] font-bold text-gray-700 ml-3">
            Moulab Rental ERP
          </h1>
        </div>

        {/* ------- 대카테고리 메뉴 (20% 확대) ------- */}
        {/* 기존 text-[0.82rem] → 20% 증가 → text-[0.98rem] */}
        <nav className="flex items-center gap-10 text-[0.98rem] font-semibold text-gray-700 ml-[140px]">
          {TOP_MENUS.map((m) => (
            <button
              key={m}
              onClick={() => {
                setTop(m);
                setSub(SUB_MENUS[m][0]);
                setShowSub(true);
              }}
              className={`pb-1 ${
                top === m
                  ? "border-b-2 border-black text-black"
                  : "hover:text-black"
              }`}
            >
              {m}
            </button>
          ))}
        </nav>

        {/* ------- 소카테고리 (대카테고리 바로 아래 표시) ------- */}
        {top && showSub && (
          <div className="flex gap-2 mt-3 ml-[140px]">
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

      {/* ---------------- 메인 화면 ---------------- */}
      <main className="px-[0.5cm] py-4 w-full">
        <CurrentView />
      </main>
    </div>
  );
}




