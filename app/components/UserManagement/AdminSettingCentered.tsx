'use client';

import { useEffect, useState } from 'react';
import AdminSetting from './AdminSetting';
import LockScreen from './LockScreen';

// ⛔ 잘못된 경로: '@/app/lib/permissions'
// ✅ 올바른 경로: '@/lib/permissions'
import { getCurrentUser, isAdmin } from '@/lib/permissions';

const ADMIN_ID_FIXED = 'medela1280';

export default function AdminSettingCentered() {
  const [isAdminUser, setIsAdminUser] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      const authed = sessionStorage.getItem('erp_auth') === '1';
      const uid =
        sessionStorage.getItem('erp_user') ||
        localStorage.getItem('erp_user') ||
        '';

      const current = getCurrentUser();
      const adminCheck =
        (authed && uid === ADMIN_ID_FIXED) ||
        (current && isAdmin(current));

      setIsAdminUser(!!adminCheck);
    } catch {
      setIsAdminUser(false);
    }
  }, []);

  if (isAdminUser === null) return null;
  if (!isAdminUser) return <LockScreen />;

  return (
    <div className="min-h-[calc(100vh-80px)] flex items-start justify-center">
      <div className="mt-6">
        <AdminSetting />
      </div>
    </div>
  );
}

