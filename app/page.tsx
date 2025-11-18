'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Page() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function check() {
      try {
        const r = await fetch('/api/auth/me', {
          method: 'GET',
          credentials: 'include',
        });

        const data = await r.json();

        // 로그인 안됨 → 로그인 페이지로 이동
        if (!data.ok) {
          router.replace('/login');
          return;
        }

        // 로그인 성공 → 통합관리(AppShell) 페이지로 이동
        router.replace('/main');
      } catch {
        router.replace('/login');
      } finally {
        setLoading(false);
      }
    }

    check();
  }, [router]);

  return null;
}

