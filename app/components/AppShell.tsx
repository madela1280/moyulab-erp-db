"use client";

import Image from "next/image";
import { useState, useRef, useEffect } from "react";
import { TOP_MENUS, TopMenu } from "@/menus/topMenus";
import { SUB_MENUS } from "@/menus/subMenus";
import { makeRouteKey } from "@/menus/menuRouter";
import { VIEW_MAP } from "@/menus/viewMap";

export default function AppShell() {
  const [top, setTop] = useState<TopMenu | null>(null);
  const [sub, setSub] = useState<string | null>(null);
  const [showSub, setShowSub] = useState(false);

  const hideTimer = useRef<NodeJS.Timeout | null>(null);

  const CurrentView =
    top && sub ? VIEW_MAP[makeRouteKey(top, sub)] : () => <div />;

  const startHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowSub(false), 5000);
  };

  const stopHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
  };

  const clickTop = (m: TopMenu) => {
    setTop(m);
    setSub(SUB_MENUS[m][0]);
    setShowSub(true);
    startHide();
  };

  const clickSub = (s: string) => {
    setSub(s);
    setShowSub(false);
    stopHide();
  };

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  return (
    <div className="min-h-screen w-full bg-gray-50 relative">

      {/* HEADER (2줄 구조 → 절대 흔들리지 않음) */}
      <header className="w-full bg-gray-100 border-b px-8 py-3 flex flex-col relative">

        {/* 1단: 로고 + 타이틀 (독립 레이어 → 메뉴 움직임 영향 X) */}
        <div className="flex items-center h-12">
          <Image src="/logo.png" alt="logo" width={36} height={36} />
          <h1 className="ml-3 text-[1.45rem] font-bold text-gray-800">
            Moulab
          </h1>
        </div>

        {/* 2단: 대카테고리 (단독 줄 → 정렬 100% 안정) */}
        <nav className="flex gap-8 mt-4 text-[0.90rem] font-semibold text-gray-700">
          {TOP_MENUS.map((m) => (
            <button
              key={m}
              onClick={() => clickTop(m)}
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

        {/* 소카테고리: absolute → 대카테고리 바로 아래 고정 / 레이아웃에 영향 X */}
        {top && showSub && (
          <div
            className="absolute left-8 top-[92px] flex gap-2 bg-gray-100 py-2"
            onMouseEnter={stopHide}
            onMouseLeave={startHide}
            style={{ zIndex: 20 }}
          >
            {SUB_MENUS[top].map((s) => (
              <button
                key={s}
                onClick={() => clickSub(s)}
                className={`px-3 py-1 text-xs rounded-full border
                  ${
                    sub === s
                      ? "bg-blue-100 border-blue-300 text-blue-700"
                      : "bg-white border-gray-300 text-gray-700 hover:bg-gray-100"
                  }
                `}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* MAIN */}
      <main className="px-6 py-4 w-full">
        <CurrentView />
      </main>
    </div>
  );
}




