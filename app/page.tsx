'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Page() {
  const router = useRouter();

  useEffect(() => {

    // ✅ NEW: 먼저 로그인 페이지로 강제 이동 (ERP 처음 접근 시)
    if (window.location.pathname === '/') {
      router.replace('/login');
      return;
    }

    async function check() {
      try {
        const r = await fetch('/api/auth/me', {
          method: 'GET',
          credentials: 'include',
        });

        const data = await r.json();

        if (!data.ok) {
          // 🔥 로그인 안 됨 → 로그인 페이지
          router.replace('/login');
          return;
        }

        // 🔥 로그인 OK → 메인(AppShell)으로 이동
        router.replace('/main');
      } catch {
        router.replace('/login');
      }
    }

    check();
  }, [router]);

  return null;
}



