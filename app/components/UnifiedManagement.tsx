'use client';

import React, { useEffect, useState } from 'react';
import UnifiedGrid from './UnifiedGrid';

export default function UnifiedManagement() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/auth/me', {
          method: 'GET',
          credentials: 'include',
        });

        const data = await r.json();

        if (!data.ok) {
          window.location.href = '/login';
          return;
        }

        setReady(true);
      } catch {
        window.location.href = '/login';
      }
    })();
  }, []);

  if (!ready) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-gray-500">
        통합관리 데이터를 불러오는 중입니다...
      </div>
    );
  }

  return <UnifiedGrid viewId="통합관리" />;
}





