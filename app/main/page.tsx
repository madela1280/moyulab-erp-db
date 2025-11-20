'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

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

        if (!data.ok) {
          router.replace('/login');
          return;
        }

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




