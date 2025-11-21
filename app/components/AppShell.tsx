"use client";

import Image from "next/image";
import { useState } from "react";
import { TOP_MENUS, TopMenu } from "@/menus/topMenus";
import { SUB_MENUS } from "@/menus/subMenus";
import { makeRouteKey } from "@/menus/menuRouter";
import { VIEW_MAP } from "@/menus/viewMap";

export default function AppShell() {
  const [top, setTop] = useState<TopMenu | null>(null);
  const [sub, setSub] = useState<string | null>(null);

  const CurrentView =
    top && sub ? VIEW_MAP[makeRouteKey(top, sub)] : () => <div />;

  return (
    <div className="min-h-screen bg-gray-50 w-full">

      {/* HEADER */}
      <header className="bg-gray-100 border-b w-full px-8 py-3 flex flex-col">

        {/* 1단: 로고 + 대카테고리 */}
        <div className="flex items-center gap-10">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="logo" width={36} height={36} />
            <h1 className="text-[1.45rem] font-bold text-gray-800">Moulab</h1>
          </div>

          <nav className="flex items-center gap-8 text-[0.90rem] font-semibold text-gray-700">
            {TOP_MENUS.map((m) => (
              <button
                key={m}
                onClick={() => {
                  setTop(m);
                  setSub(SUB_MENUS[m][0]);
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

        {/* 2단: 소카테고리 */}
        {top && (
          <div className="flex gap-2 mt-3 ml-[4.2rem]">
            {SUB_MENUS[top].map((s) => (
              <button
                key={s}
                onClick={() => setSub(s)}
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

      {/* MAIN VIEW */}
      <main className="px-6 py-4 w-full">
        <CurrentView />
      </main>
    </div>
  );
}



