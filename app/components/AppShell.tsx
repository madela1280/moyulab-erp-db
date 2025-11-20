'use client';

import Image from 'next/image';
import { useState } from 'react';
import { TOP_MENUS } from '@/menus/topMenus';
import { SUB_MENUS } from '@/menus/subMenus';
import { makeRouteKey } from '@/menus/menuRouter';
import { VIEW_MAP } from '@/menus/viewMap';

export default function AppShell() {
  const [top, setTop] = useState('통합관리');
  const [sub, setSub] = useState('통합관리');

  const CurrentView = VIEW_MAP[makeRouteKey(top, sub)];

  return (
    <div className="min-h-screen bg-gray-50">

      <header className="bg-gray-100 border-b px-6 pt-3 pb-2">
        <div className="flex items-center">
          <Image src="/moyulogo.jpg" alt="Logo" width={36} height={36} />
          <h1 className="text-xl font-bold text-gray-700 ml-3">
            Moulab Rental ERP
          </h1>

          <nav className="hidden md:flex items-center gap-8 ml-20">
            {TOP_MENUS.map((item) => (
              <button
                key={item}
                onClick={() => {
                  setTop(item);
                  setSub(SUB_MENUS[item][0] || item);
                }}
                className={`text-sm font-semibold ${
                  top === item ? 'text-black' : 'text-gray-600'
                }`}
              >
                {item}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <div className="bg-white border-b px-6 py-2 flex items-center gap-2">
        {SUB_MENUS[top].map((item) => (
          <button
            key={item}
            onClick={() => setSub(item)}
            className={`px-3 py-1 text-sm rounded-full border ${
              sub === item
                ? 'bg-blue-100 border-blue-300 text-blue-700'
                : 'bg-gray-50'
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      <main className="p-6">
        {CurrentView ? <CurrentView /> : '페이지 준비 중'}
      </main>
    </div>
  );
}

