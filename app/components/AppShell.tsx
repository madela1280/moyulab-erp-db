"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { TOP_MENUS } from "@/menus/topMenus";
import { SUB_MENUS } from "@/menus/subMenus";
import { makeRouteKey } from "@/menus/menuRouter";
import { VIEW_MAP } from "@/menus/viewMap";

export default function AppShell() {
  const [top, setTop] = useState(null);
  const [sub, setSub] = useState(null);
  const [showSub, setShowSub] = useState(false);

  const CurrentView =
    top && sub ? VIEW_MAP[makeRouteKey(top, sub)] : () => <div />;

  useEffect(() => {
    if (!showSub) return;
    const t = setTimeout(() => setShowSub(false), 5000);
    return () => clearTimeout(t);
  }, [showSub]);

  return (
    <div className="min-h-screen bg-gray-50 w-full">

      {/* HEADER */}
      <header className="bg-gray-100 border-b w-full px-8 py-3">

        {/* 로고 + 제목 + 대카테고리 한 줄 */}
        <div className="flex items-center justify-between">

          {/* 로고 + 제목 */}
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="logo" width={36} height={36} />
            <h1 className="text-[1.45rem] font-bold text-gray-800">Moulab</h1>
          </div>

          {/* 대카테고리 (왼쪽으로 17cm 이동 유지) */}
          <nav
            className="flex items-center gap-8 text-[0.90rem] font-semibold text-gray-700"
            style={{ marginLeft: "17cm" }}
          >
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

        {/* 소카테고리 (대카테고리 바로 아래에 노출되도록 독립 레이어) */}
        {top && showSub && (
          <div
            className="flex gap-2 mt-2"
            style={{
              marginLeft: "17cm",
              display: "flex",
              position: "relative",
            }}
          >
            {SUB_MENUS[top].map((s) => (
              <button
                key={s}
                onClick={() => {
                  setSub(s);
                  setShowSub(false);
                }}
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

      {/* 메인 */}
      <main className="px-6 py-4 w-full">
        <CurrentView />
      </main>
    </div>
  );
}





