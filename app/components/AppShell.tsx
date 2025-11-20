// app/components/AppShell.tsx
'use client';

import Image from 'next/image';
import React, { useEffect, useState } from 'react';

import UnifiedManagement from '@/components/UnifiedManagement';
import OnlineManagement from '@/components/OnlineManagement';
import HealthCenterManagement from '@/components/HealthCenterManagement';
import PostpartumManagement from '@/components/PostpartumManagement';

import DeviceFreestyle from '@/components/DeviceFreestyle';
import DeviceGaksimil from '@/components/DeviceGaksimil';
import DeviceLactina from '@/components/DeviceLactina';
import DeviceSirilac from '@/components/DeviceSirilac';
import DeviceSwing from '@/components/DeviceSwing';
import DeviceSwingMaxi from '@/components/DeviceSwingMaxi';
import DeviceSymphony from '@/components/DeviceSymphony';

import NewSignup from '@/components/NewSignup';
import UserAdd from '@/components/UserManagement/UserAdd';
import PermissionSetting from '@/components/UserManagement/PermissionSetting';
import AdminSettingCentered from '@/components/UserManagement/AdminSettingCentered';

import LockScreen from '@/components/UserManagement/LockScreen';
import { getCurrentUser, isAdmin } from '@/lib/permissions';

// 로그인 체크
function useAuthCheck() {
  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch('/api/auth/me', {
          method: 'GET',
          credentials: 'include',
        });
        const data = await r.json();
        if (!data.ok) window.location.href = '/login';
      } catch {
        window.location.href = '/login';
      }
    };
    check();
  }, []);
}

// TOP MENU 타입
export type TopMenu =
  | '사용자관리'
  | '통합관리'
  | '기기관리'
  | '데이터업로드'
  | '대여관리'
  | '유축기현황'
  | '문자'
  | '합포장'
  | '집계';

type SubMenuMap = Record<TopMenu, string[]>;

export const SUB_MENUS: SubMenuMap = {
  사용자관리: ['사용자추가', '권한설정', '관리자설정'],
  통합관리: ['통합관리', '온라인', '보건소', '조리원'],
  기기관리: ['프리스타일', '각시밀', '락티나', '시밀래', '스윙', '스윙맥시', '심포니'],
  데이터업로드: ['신규가입'],
  대여관리: [],
  유축기현황: [],
  문자: [],
  합포장: [],
  집계: [],
};

export default function AppShell() {
  useAuthCheck();

  const [openTop, setOpenTop] = useState<TopMenu>('통합관리');
  const [activeSub, setActiveSub] = useState<string | null>(null);

  useEffect(() => {
    const first = SUB_MENUS[openTop]?.[0] ?? null;
    setActiveSub(first);
  }, [openTop]);

  const VIEW_MAP: Record<string, React.FC> = {
    '통합관리>통합관리': UnifiedManagement,
    '통합관리>온라인': OnlineManagement,
    '통합관리>보건소': HealthCenterManagement,
    '통합관리>조리원': PostpartumManagement,

    '기기관리>프리스타일': DeviceFreestyle,
    '기기관리>각시밀': DeviceGaksimil,
    '기기관리>락티나': DeviceLactina,
    '기기관리>시밀래': DeviceSirilac,
    '기기관리>스윙': DeviceSwing,
    '기기관리>스윙맥시': DeviceSwingMaxi,
    '기기관리>심포니': DeviceSymphony,

    '데이터업로드>신규가입': NewSignup,

    '사용자관리>사용자추가': UserAdd,
    '사용자관리>권한설정': PermissionSetting,
    '사용자관리>관리자설정': AdminSettingCentered,
  };

  const currentKey = activeSub ? `${openTop}>${activeSub}` : '';
  const ActiveView = VIEW_MAP[currentKey] ?? (() => <div>페이지 준비중…</div>);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* HEADER */}
      <header className="bg-gray-100 border-b px-6 pt-3 pb-2">
        <div className="flex items-center">
          <div className="flex items-center space-x-3">
            <Image src="/moyulogo.jpg" alt="Moulab Logo" width={36} height={36} priority />
            <h1 className="text-xl font-bold text-gray-700">Moulab Rental ERP</h1>
          </div>

          <nav className="hidden md:flex items-center gap-[2.4rem] ml-[380px]">
            {(
              [
                '사용자관리',
                '통합관리',
                '기기관리',
                '데이터업로드',
                '대여관리',
                '유축기현황',
                '문자',
                '합포장',
                '집계',
              ] as TopMenu[]
            ).map((m) => (
              <button
                key={m}
                onClick={() => setOpenTop(m)}
                className={`text-[0.95rem] font-semibold ${
                  openTop === m ? 'text-black' : 'text-gray-700 hover:text-black'
                }`}
              >
                {m}
              </button>
            ))}
          </nav>
          <div className="flex-1" />
        </div>
      </header>

      {/* SUB 메뉴 */}
<div className="bg-white border-b px-6 py-2 flex items-center gap-2">
  {SUB_MENUS[openTop].map((s) => (
    <button
      key={s}
      onClick={() => setActiveSub(s)}
      className={`px-3 py-1 text-sm rounded-full border ${
        activeSub === s
          ? 'bg-blue-100 border-blue-300 text-blue-700'
          : 'bg-gray-50 hover:bg-gray-100'
      }`}
    >
      {s}
    </button>
  ))}
</div>

{/* 콘텐츠 영역 */}
<main className="p-6">
  <ActiveView />
</main>

    </div>
  );
}


