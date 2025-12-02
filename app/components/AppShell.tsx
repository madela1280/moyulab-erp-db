"use client";

import "@/global-socket/socket-client.js";
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
  const [dropdownLeft, setDropdownLeft] = useState(0);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const CurrentView =
    top && sub ? VIEW_MAP[makeRouteKey(top, sub)] : () => <div />;

  const startTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setShowSub(false), 5000);
  };
  const stopTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 w-full">
      <header className="w-full bg-gray-100 border-b px-8 py-3 relative">
        <div className="flex items-center">
          <div className="flex items-center gap-3 mr-12">
            <Image src="/logo.png" alt="logo" width={36} height={36} />
            <h1 className="text-[1.45rem] font-bold text-gray-800">Moulab</h1>
          </div>

          <nav className="flex-grow flex text-[0.90rem] font-semibold text-gray-700 ml-40">
            <div className="flex items-center gap-8 relative">
              {TOP_MENUS.map((m) => (
                <button
                  key={m}
                  onClick={(e) => {
                    setTop(m);
                    setSub(SUB_MENUS[m][0]);
                    setShowSub(true);
                    startTimer();
                    setDropdownLeft(e.currentTarget.offsetLeft);
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

              {top && showSub && (
                <div
                  className="flex gap-2 absolute w-max"
                  style={{ top: "40px", left: `${dropdownLeft}px` }}
                  onMouseEnter={stopTimer}
                  onMouseLeave={startTimer}
                >
                  {SUB_MENUS[top].map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        setSub(s);
                        setShowSub(false);
                        stopTimer();
                      }}
                      className={`px-3 py-1 text-xs rounded-full border
                        bg-gray-300 border-gray-500 text-gray-800
                      `}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </nav>
        </div>
      </header>

      <main className="px-6 py-4 w-full">
        <CurrentView key={`${top}-${sub}`} />
      </main>
    </div>
  );
}

