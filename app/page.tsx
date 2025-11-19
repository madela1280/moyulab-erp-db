'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Page() {
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

        router.replace('/main');
      } catch {
        router.replace('/login');
      }
    }

    check();
  }, [router]);

  return null;
}




