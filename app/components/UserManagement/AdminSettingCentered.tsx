'use client';

import { useEffect, useState } from 'react';
import AdminSetting from './AdminSetting';
import LockScreen from './LockScreen';
import { getCurrentUser, isAdmin } from '@/app/lib/permissions';

const ADMIN_ID_FIXED = 'medela1280';

export default function AdminSettingCentered() {
  const [isAdminUser, setIsAdminUser] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      const current = getCurrentUser();
      const adminCheck = current && isAdmin(current);
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
