'use client';

import React, { useState } from 'react';

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

import UnifiedGrid from '@/components/UnifiedGrid';

/* ----------------------------------------------------
   PermissionSetting.tsx 가 필요로 하는 export
---------------------------------------------------- */
export const MENUS = [
  { label: '통합관리' },
  { label: '기기관리' },
  { label: '신규가입' },
  { label: '사용자관리' },
];

/* ----------------------------------------------------
   VIEW_MAP
---------------------------------------------------- */
export const VIEW_MAP: Record<string, React.FC> = {
  // 통합관리
  '통합관리': UnifiedManagement,
  '통합관리>통합관리': UnifiedManagement,
  '통합관리>온라인': OnlineManagement,
  '통합관리>보건소': HealthCenterManagement,
  '통합관리>조리원': PostpartumManagement,

  // 기기관리
  '기기관리>프리스타일': DeviceFreestyle,
  '기기관리>각시밀': DeviceGaksimil,
  '기기관리>락티나': DeviceLactina,
  '기기관리>시밀래': DeviceSirilac,
  '기기관리>스윙': DeviceSwing,
  '기기관리>스윙맥시': DeviceSwingMaxi,
  '기기관리>심포니': DeviceSymphony,

  // 통합 Grid — props 필요하므로 래핑
  'UNIFIED': () => <UnifiedGrid viewId="UNIFIED" />,

  // 기타
  '신규가입': NewSignup,
  '사용자관리>사용자추가': UserAdd,
  '사용자관리>권한설정': PermissionSetting,
  '사용자관리>관리자설정': AdminSettingCentered,
};

/* ----------------------------------------------------
   AppShell
---------------------------------------------------- */
export default function AppShell() {
  const [view, setView] = useState('통합관리');

  const Comp = VIEW_MAP[view] ?? (() => <div>준비되지 않은 화면</div>);

  return (
    <div className="flex h-screen">
      {/* 좌측 메뉴 */}
      <div className="w-48 border-r p-2 text-sm space-y-2">
        {Object.keys(VIEW_MAP).map((k) => (
          <div
            key={k}
            className={`p-2 rounded cursor-pointer ${
              view === k ? 'bg-blue-100' : 'hover:bg-gray-100'
            }`}
            onClick={() => setView(k)}
          >
            {k}
          </div>
        ))}
      </div>

      {/* 우측 화면 */}
      <div className="flex-1 overflow-auto p-4">
        <Comp />
      </div>
    </div>
  );
}






