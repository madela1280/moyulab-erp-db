'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const AppShell = dynamic(() => import('@/components/AppShell'), {
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

  return <AppShell />;
}
