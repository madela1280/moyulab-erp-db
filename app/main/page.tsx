'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const AppShell = dynamic(() => import('@/components/AppShell'), {
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

        // 🔥 로그인 안 된 경우 → /login
        if (!data.ok) {
          router.replace('/login');
          return;
        }

        // 🔥 로그인 OK → ERP 보여주기
        setAuthorized(true);

      } catch (e) {
        router.replace('/login');
      }
    }

    check();
  }, [router]);

  // 로그인 체크 끝날 때까지 화면 숨김
  if (!authorized) return null;

  // 로그인된 경우에만 AppShell 표시
  return <AppShell />;
}


