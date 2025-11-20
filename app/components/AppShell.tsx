"use client";

import Image from "next/image";
import { useState } from "react";
import { TOP_MENUS } from "@/menus/topMenus";
import { SUB_MENUS } from "@/menus/subMenus";
import { makeRouteKey } from "@/menus/menuRouter";
import { VIEW_MAP } from "@/menus/viewMap";

export default function AppShell() {
  const [top, setTop] = useState<keyof typeof TOP_MENUS>("통합관리");
  const [sub, setSub] = useState(SUB_MENUS["통합관리"][0]);

  const CurrentView = VIEW_MAP[makeRouteKey(top, sub)];

  return (
    <div className="min-h-screen bg-gray-50">

      <header className="bg-gray-100 border-b px-6 pt-3 pb-2">
        <div className="flex items-center">
          <Image
            src="/moyulogo.jpg"
            alt="Moulab Logo"
            width={36}
            height={36}
          />
          <h1 className="text-xl font-bold text-gray-700 ml-3">
            Moulab Rental ERP
          </h1>

          <nav className="hidden md:flex items-center gap-[2.4rem] ml-[380px]">
            {Object.keys(TOP_MENUS).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setTop(m as keyof typeof TOP_MENUS);
                  setSub(SUB_MENUS[m as keyof typeof TOP_MENUS][0]);
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
      </header>

      <div className="bg-white border-b px-6 py-2 flex items-center gap-2">
        {SUB_MENUS[top].map((s) => (
          <button
            key={s}
            onClick={() => setSub(s)}
            className={`px-3 py-1 text-sm rounded-full border ${
              sub === s
                ? "bg-blue-100 border-blue-300 text-blue-700"
                : "bg-gray-50 hover:bg-gray-100"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <main className="p-6">
        <CurrentView />
      </main>
    </div>
  );
}




