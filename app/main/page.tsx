'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

// ⛔ 잘못된 경로: '@/components/AppShell'
// ✅ 올바른 경로: '@/app/components/AppShell'
const AppShell = dynamic(() => import('@/app/components/AppShell'), {
  ssr: false,
});

export default function MainPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    async function check() {
      try {
        const r = await fetch('/api/auth/me', {
          method: 'GET',
          credentials: 'include',
        });

        const data = await r.json();

        // 로그인 안 된 경우 → 로그인 페이지로
        if (!data.ok) {
          router.replace('/login');
          return;
        }

        // 로그인 O
        setAuthorized(true);

      } catch (e) {
        router.replace('/login');
      }
    }

    check();
  }, [router]);

  if (!authorized) return null;

  return <AppShell />;
}



