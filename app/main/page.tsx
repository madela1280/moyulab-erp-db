'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const AppShell = dynamic(() => import('@/app/components/AppShell'), {
  ssr: false,
});

export default function MainPage() {
  const router = useRouter();

  useEffect(() => {
    async function check() {
      try {
        const r = await fetch('/api/auth/me', {
          method: 'GET',
          credentials: 'include',
        });

        const data = await r.json();

        // 🔥 로그인 안 됨 → 로그인 페이지
        if (!data.ok) {
          router.replace('/login');
          return;
        }
      } catch {
        router.replace('/login');
      }
    }

    check();
  }, [router]);

  // 🔥 로그인 되어 있으면 AppShell 전체 표시 → 통합관리 자동 출력
  return <AppShell />;
}
