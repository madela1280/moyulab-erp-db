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
          
          {/* 좌측 로고/타이틀 영역 */}
          <div className="flex items-center gap-3 mr-12">
            <Image src="/logo.png" alt="logo" width={36} height={36} />
            <h1 className="text-[1.45rem] font-bold text-gray-800">Moulab</h1>
          </div>

          {/* ⚠️ 수정: justify-center 제거, ml-40 (약 10cm) 추가하여 좌측으로 이동 */}
          <nav className="flex-grow flex text-[0.90rem] font-semibold text-gray-700 ml-40">
            
            <div className="flex items-center gap-8 relative"> 
              
              {/* 대카테고리 */}
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

              {/* 소카테고리 (회색 톤으로 변경됨) */}
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
                        ${
                          // ⚠️ 수정: 선택된 메뉴는 진한 회색, 나머지는 연한 회색으로 변경
                          sub === s
                            ? "bg-gray-300 border-gray-500 text-gray-800" 
                            : "bg-gray-100 border-gray-300 text-gray-700" 
                        }`}
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
        <CurrentView />
      </main>
    </div>
  );
}