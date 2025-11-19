'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * ✅ AppShell (최종 완성본)
 * - 모든 페이지의 공통 레이아웃
 * - 쿠키 기반 로그인 세션 유지
 * - 서버(DB) 기반 ERP 구조와 완전 일치
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let active = true;

    const check = async () => {
      try {
        const res = await fetch('/api/auth/me', {
          method: 'GET',
          credentials: 'include',
        });
        const data = await res.json();

        if (!active) return;

        if (!data.ok) {
          window.location.href = '/login';
          return;
        }

        setAuthorized(true);
      } catch {
        if (active) window.location.href = '/login';
      } finally {
        if (active) setLoading(false);
      }
    };

    check();
    return () => { active = false };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-500">
        ERP 초기화 중...
      </div>
    );
  }

  if (!authorized) return null;

  const menus = [
    { name: '사용자관리', path: '/users' },
    { name: '통합관리', path: '/unified' },
    { name: '기기관리', path: '/device' },
    { name: '데이터업로드', path: '/upload' },
    { name: '대여관리', path: '/rental' },
    { name: '유축기현황', path: '/status' },
    { name: '문자', path: '/sms' },
    { name: '합포장', path: '/packing' },
    { name: '집계', path: '/stats' },
  ];

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* 상단바 */}
      <header className="bg-white border-b shadow-sm px-6 py-3 flex items-center">
        <div className="text-xl font-semibold text-blue-700">모유랩 ERP</div>
        <nav className="ml-10 flex items-center gap-4 text-sm">
          {menus.map((m) => (
            <Link
              key={m.path}
              href={m.path}
              className={
                pathname === m.path
                  ? 'px-3 py-1 rounded bg-blue-600 text-white'
                  : 'px-3 py-1 rounded hover:bg-gray-100'
              }
            >
              {m.name}
            </Link>
          ))}
        </nav>

        <button
          className="ml-auto text-sm border rounded px-3 py-1 hover:bg-gray-50"
          onClick={async () => {
            await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
            window.location.href = '/login';
          }}
        >
          로그아웃
        </button>
      </header>

      {/* 본문 */}
      <main className="flex-1 p-4">
        {children}
      </main>
    </div>
  );
}




