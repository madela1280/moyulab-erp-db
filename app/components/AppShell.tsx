"use client";

import Image from "next/image";
import { useState } from "react";
import { TOP_MENUS } from "@/menus/topMenus";
import { SUB_MENUS } from "@/menus/subMenus";
import { makeRouteKey } from "@/menus/menuRouter";
import { VIEW_MAP } from "@/menus/viewMap";

export default function AppShell() {
  const [top, setTop] = useState<(typeof TOP_MENUS)[number] | null>(null);
  const [sub, setSub] = useState<string | null>(null);

  const CurrentView =
    top && sub ? VIEW_MAP[makeRouteKey(top, sub)] : () => <div />;

  return (
    <div className="min-h-screen bg-gray-50">

      <header className="bg-gray-100 border-b px-6 pt-3 pb-2">
        <div className="flex items-center">
          <Image
            src="/logo.png"
            alt="Moulab Logo"
            width={36}
            height={36}
          />

          <h1 className="text-xl font-bold text-gray-700 ml-3">
            Moulab Rental ERP
          </h1>

          {/* 대카테고리 */}
          <nav className="hidden md:flex items-center gap-[2.4rem] ml-auto">
            {TOP_MENUS.map((m) => (
              <button
                key={m}
                onClick={() => {
                  setTop(m);
                  setSub(SUB_MENUS[m][0]);
                }}
                className={`text-[0.95rem] font-semibold ${
                  top === m ? "text-black" : "text-gray-700 hover:text-black"
                }`}
              >
                {m}
              </button>
            ))}
          </nav>
        </div>

        {/* 소카테고리 – 대카테고리 클릭 시에만 보여줌 */}
        {top && (
          <div className="mt-3 flex items-center gap-1">
            {SUB_MENUS[top].map((s) => (
              <button
                key={s}
                onClick={() => setSub(s)}
                className={`px-2 py-0.5 text-xs rounded-full border ${
                  sub === s
                    ? "bg-blue-100 border-blue-300 text-blue-700"
                    : "bg-gray-50 hover:bg-gray-100"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="p-6">
        <CurrentView />
      </main>
    </div>
  );
}






