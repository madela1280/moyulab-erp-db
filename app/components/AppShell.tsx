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

  // 소카테고리 5초 자동 숨김
  useEffect(() => {
    if (showSub) {
      const t = setTimeout(() => setShowSub(false), 5000);
      return () => clearTimeout(t);
    }
  }, [showSub]);

  return (
    <div className="min-h-screen bg-gray-50 w-full">

      {/* --------------------- 상단 전체 컨테이너 --------------------- */}
      <header className="bg-gray-100 border-b w-full px-10 pt-4">

        {/* 1) 로고 + ERP 제목 */}
        <div className="flex items-center mb-3">
          <Image
            src="/logo.png"
            alt="logo"
            width={52}   // 30% 확대
            height={52}
          />

          <h1 className="text-[1.6rem] font-bold text-gray-700 ml-4">
            {/* 20% 축소 */}
            Moulab Rental ERP
          </h1>
        </div>

        {/* 2) 대카테고리 */}
        <nav className="flex items-center gap-10 text-[0.82rem] font-semibold text-black ml-[200px]">
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
                  ? "pb-1 border-b-2 border-gray-700"
                  : "hover:text-gray-700"
              }
            >
              {m}
            </button>
          ))}
        </nav>

        {/* 3) 소카테고리 — 반드시 대카테고리 바로 아래 */}
        {top && showSub && (
          <div className="flex gap-2 mt-3 ml-[200px]">
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

      {/* --------------------- 메인 화면 --------------------- */}
      <main className="px-[0.5cm] py-4 w-full">
        <CurrentView />
      </main>
    </div>
  );
}
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

  // 소카테고리 5초 자동 숨김
  useEffect(() => {
    if (showSub) {
      const t = setTimeout(() => setShowSub(false), 5000);
      return () => clearTimeout(t);
    }
  }, [showSub]);

  return (
    <div className="min-h-screen bg-gray-50 w-full">

      {/* --------------------- 상단 전체 컨테이너 --------------------- */}
      <header className="bg-gray-100 border-b w-full px-10 pt-4">

        {/* 1) 로고 + ERP 제목 */}
        <div className="flex items-center mb-3">
          <Image
            src="/logo.png"
            alt="logo"
            width={52}   // 30% 확대
            height={52}
          />

          <h1 className="text-[1.6rem] font-bold text-gray-700 ml-4">
            {/* 20% 축소 */}
            Moulab Rental ERP
          </h1>
        </div>

        {/* 2) 대카테고리 */}
        <nav className="flex items-center gap-10 text-[0.82rem] font-semibold text-black ml-[200px]">
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
                  ? "pb-1 border-b-2 border-gray-700"
                  : "hover:text-gray-700"
              }
            >
              {m}
            </button>
          ))}
        </nav>

        {/* 3) 소카테고리 — 반드시 대카테고리 바로 아래 */}
        {top && showSub && (
          <div className="flex gap-2 mt-3 ml-[200px]">
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

      {/* --------------------- 메인 화면 --------------------- */}
      <main className="px-[0.5cm] py-4 w-full">
        <CurrentView />
      </main>
    </div>
  );
}



