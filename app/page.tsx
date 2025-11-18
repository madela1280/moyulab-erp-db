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

        if (!data.ok) {
          router.replace('/login');
          return;
        }

        // 로그인 성공 → ERP 메인으로 이동
        router.replace('/main');
      } catch (e) {
        router.replace('/login');
      } finally {
        setLoading(false);
      }
    }

    check();
  }, [router]);

  if (loading) return null;

  return null;
}


