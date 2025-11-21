"use client";

import Image from "next/image";
import { useState, useRef, useEffect } from "react";
// 가정: 다음 파일들은 프로젝트에 존재하며 수정하지 않았습니다.
import { TOP_MENUS, TopMenu } from "@/menus/topMenus";
import { SUB_MENUS } from "@/menus/subMenus";
import { makeRouteKey } from "@/menus/menuRouter";
import { VIEW_MAP } from "@/menus/viewMap";

export default function AppShell() {
  const [top, setTop] = useState<TopMenu | null>(null);
  const [sub, setSub] = useState<string | null>(null);
  const [showSub, setShowSub] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // VIEW_MAP에서 컴포넌트를 가져옵니다.
  const CurrentView =
    top && sub ? VIEW_MAP[makeRouteKey(top, sub)] : () => <div />;

  // 마우스 아웃 시 서브메뉴를 숨기기 위한 타이머 시작
  const startTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setShowSub(false), 5000);
  };
  // 마우스 오버 시 타이머 중지
  const stopTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 w-full">

      <header className="w-full bg-gray-100 border-b px-8 py-3 relative">

        {/* 1줄: 로고 + 타이틀 (좌측) + 대카테고리 (중앙) */}
        {/* flex items-center만 사용하여 수직 중앙 정렬을 유지합니다. */}
        <div className="flex items-center">
          
          {/* 좌측 로고/타이틀 영역 */}
          <div className="flex items-center gap-3 mr-12">
            <Image src="/logo.png" alt="logo" width={36} height={36} />
            <h1 className="text-[1.45rem] font-bold text-gray-800">Moulab</h1>
          </div>

          {/* 대카테고리 영역: flex-grow로 남은 공간을 채우고, justify-center로 메뉴를 중앙 정렬합니다. */}
          <nav className="flex-grow flex justify-center text-[0.90rem] font-semibold text-gray-700">
            
            {/* 메뉴 목록 Wrapper: 이 요소에 relative를 줘서 소카테고리의 absolute 기준점이 되게 합니다. */}
            <div className="flex items-center gap-8 relative"> 
              
              {/* 대카테고리 */}
              {TOP_MENUS.map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setTop(m);
                    setSub(SUB_MENUS[m][0]);
                    setShowSub(true);
                    startTimer();
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

              {/* 소카테고리 — 대카테고리 바로 아래 (Wrapper 기준 absolute) */}
              {top && showSub && (
                <div
                  // left-0를 사용하여 Wrapper의 가장 왼쪽 메뉴 아래에 위치시킵니다.
                  className="flex gap-2 absolute w-max"
                  style={{ top: "40px", left: "0" }} // top: 메뉴 버튼 높이에 맞춰 드롭다운 위치 조정
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
                          sub === s
                            ? "bg-blue-100 border-blue-300 text-blue-700"
                            : "bg-white border-gray-300 text-gray-700 hover:bg-gray-100"
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



