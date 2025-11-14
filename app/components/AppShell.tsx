'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import dynamic from 'next/dynamic';

// ✅ UnifiedManagement는 반드시 동적 import로 불러오기 (빌드러의 모듈 파싱 오류 방지)
const UnifiedManagement = dynamic(() => import('./UnifiedManagement'), { ssr: false });

/**
 * ✅ 메뉴 정의
 */
type MenuNode = { label: string; children?: MenuNode[] };

export const MENUS: MenuNode[] = [
  { label: '사용자 관리', children: [{ label: '사용자 추가' }, { label: '권한설정' }, { label: '관리자 설정' }] },
  { label: '통합관리', children: [{ label: '통합관리' }, { label: '온라인' }, { label: '보건소' }, { label: '조리원' }] },
  {
    label: '기기관리',
    children: [
      { label: '락티나' },
      { label: '심포니' },
      { label: '스윙' },
      { label: '스윙맥시' },
      { label: '프리스타일' },
      { label: '시밀래' },
      { label: '각시밀' },
    ],
  },
  { label: '데이터 업로드', children: [{ label: '신규가입' }, { label: '반품접수' }] },
];

export const VIEW_MAP: Record<string, React.ComponentType<any>> = {
  '통합관리': UnifiedManagement,
  '통합관리>통합관리': UnifiedManagement,
};

/**
 * ✅ 로그인 세션 검증 (DB 기반)
 */
function useAuthCheck() {
  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        const data = await res.json();
        if (!data.ok) {
          console.warn('세션 없음 → 로그인 페이지로 이동 필요');
          // router.replace('/login'); // 필요 시 추가
        }
      } catch (err) {
        console.error('세션 확인 실패:', err);
      }
    };

    checkSession();
  }, []);
}

/**
 * ✅ ERP AppShell (DB 완전연동)
 */
export default function AppShell() {
  useAuthCheck();

  const [openTop, setOpenTop] = useState<string>('통합관리');
  const [activeSub, setActiveSub] = useState<string>('통합관리');
  const [activeKey, setActiveKey] = useState<string>('통합관리>통합관리');

  // 초기 자동 포커스
  useEffect(() => {
    setOpenTop('통합관리');
    setActiveSub('통합관리');
    setActiveKey('통합관리>통합관리');
  }, []);

  const [visibleSubOf, setVisibleSubOf] = useState<string | null>(openTop);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
  };

  const startHide = () => {
    clearTimer();
    hideTimer.current = setTimeout(() => setVisibleSubOf(null), 2000);
  };

  const topMenu = useMemo(() => MENUS.find((m) => m.label === openTop) || null, [openTop]);
  const subItems = topMenu?.children ?? [];
  const pillBase = 'px-[0.6rem] h-[1.6rem] leading-[1.6rem] text-[0.62rem] rounded-full border';
  const pillIdle = 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50';
  const pillActive = 'bg-[#e7eef8] border-[#b7c4dd] text-[#2b4a7f] font-medium';
  const ActiveView = (VIEW_MAP[activeKey] ?? UnifiedManagement) as React.ComponentType<any>;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gray-100 border-b px-6 pt-3 pb-2">
        <div className="flex items-center">
          <div className="flex items-center space-x-3">
            <Image src="/logo.png" alt="Moulab Logo" width={36} height={36} priority />
            <h1 className="text-xl font-bold text-gray-700">Moyulab Rental ERP</h1>
          </div>

          <nav className="hidden md:flex items-center gap-[2.4rem] ml-[380px]">
            {MENUS.map((m) => (
              <div
                key={m.label}
                className="relative"
                onMouseEnter={() => {
                  clearTimer();
                  if (m.children?.length) setVisibleSubOf(m.label);
                }}
                onMouseLeave={startHide}
              >
                <button
                  onClick={() => {
                    setOpenTop(m.label);
                    setActiveSub(m.children?.[0]?.label ?? m.label);
                    setActiveKey(
                      m.children?.[0]?.label ? `${m.label}>${m.children[0].label}` : m.label
                    );
                    if (m.children?.length) setVisibleSubOf(m.label);
                    else setVisibleSubOf(null);
                  }}
                  className={`text-[0.95rem] font-semibold ${
                    openTop === m.label ? 'text-black' : 'text-gray-700 hover:text-black'
                  }`}
                >
                  {m.label}
                </button>

                {visibleSubOf === m.label && (m.children ?? []).length > 0 && (
                  <div
                    className="absolute left-0 top-full mt-2 z-30"
                    onMouseEnter={clearTimer}
                    onMouseLeave={startHide}
                  >
                    <div className="inline-flex whitespace-nowrap items-center gap-2 bg-white border rounded-full shadow px-3 py-1">
                      {m.children!.map((s) => (
                        <button
                          key={s.label}
                          onClick={() => {
                            if (openTop !== m.label) setOpenTop(m.label);
                            setActiveSub(s.label);
                            setActiveKey(`${m.label}>${s.label}`);
                            setVisibleSubOf(m.label);
                          }}
                          className={`${pillBase} ${
                            activeSub === s.label ? pillActive : pillIdle
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </nav>
          <div className="flex-1" />
        </div>
      </header>

      <main className="p-6">
        <ActiveView />
      </main>
    </div>
  );
}











