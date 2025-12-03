'use client';

import { useEffect, useState } from 'react';
import NoAccess from '@/components/NoAccess';

type MeSuccess = {
  ok: true;
  user: { username: string; role: string; name: string; phone: string };
};

export default function PermissionSettingView() {
  const [status, setStatus] = useState<'loading' | 'allowed' | 'denied'>(
    'loading'
  );

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' });
        const data = (await res.json()) as any;

        if (!res.ok || !data?.ok) {
          if (!cancelled) setStatus('denied');
          return;
        }

        const me = data as MeSuccess;
        if (!cancelled) {
          setStatus(me.user.role === 'admin' ? 'allowed' : 'denied');
        }
      } catch {
        if (!cancelled) setStatus('denied');
      }
    };

    check();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'loading') {
    return <div className="px-2 py-2 text-sm text-gray-500">Loading...</div>;
  }

  if (status === 'denied') {
    return <NoAccess menuLabel="권한설정" />;
  }

  // 관리자로 인증된 경우에만 실제 내용 표시
  return (
    <div className="px-2 py-2 text-sm text-gray-700">
      {/* 여기부터 실제 권한 설정 UI를 나중에 구현 */}
      PermissionSetting 페이지 (관리자 전용)
    </div>
  );
}

