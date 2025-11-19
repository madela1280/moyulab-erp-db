'use client';

import Image from 'next/image';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import UnifiedManagement from '@/app/components/UnifiedManagement';
import OnlineManagement from '@/app/components/OnlineManagement';
import HealthCenterManagement from '@/app/components/HealthCenterManagement';
import PostpartumManagement from '@/app/components/PostpartumManagement';

import DeviceFreestyle from '@/app/components/DeviceFreestyle';
import DeviceGaksimil from '@/app/components/DeviceGaksimil';
import DeviceLactina from '@/app/components/DeviceLactina';
import DeviceSirilac from '@/app/components/DeviceSirilac';
import DeviceSwing from '@/app/components/DeviceSwing';
import DeviceSwingMaxi from '@/app/components/DeviceSwingMaxi';
import DeviceSymphony from '@/app/components/DeviceSymphony';
import DeviceGrid from '@/app/components/DeviceGrid';

import ErrorCheckMenu from '@/app/components/ErrorCheckMenu';
import ExtensionModal from '@/app/components/ExtensionModal';
import FindPanel from '@/app/components/FindPanel';
import RuleModals from '@/app/components/RuleModals';
import UMGGrid from '@/app/components/UMGGrid';

import LoginForm from '@/app/components/LoginForm';
import NewSignup from '@/app/components/NewSignup';

import UnifiedGrid from '@/app/components/UnifiedGrid';
import UnifiedGridTSX from '@/app/components/UnifiedGrid';

import UserAdd from '@/app/components/UserManagement/UserAdd';
import PermissionSetting from '@/app/components/UserManagement/PermissionSetting';
import AdminSettingCentered from '@/app/components/UserManagement/AdminSettingCentered';

/* ----------------------------------------------
   1) 메뉴 구조 (A안 동일 구조 유지)
---------------------------------------------- */

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

  // 통합 Grid
  'UNIFIED': UnifiedGrid,

  // 기타 메뉴
  '신규가입': NewSignup,
  '사용자관리>사용자추가': UserAdd,
  '사용자관리>권한설정': PermissionSetting,
  '사용자관리>관리자설정': AdminSettingCentered,
};

/* ----------------------------------------------
   AppShell
---------------------------------------------- */

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




