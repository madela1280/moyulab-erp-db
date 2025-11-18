'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Page() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/login');   // ← ERP 접근 시 /login 으로 이동
  }, [router]);

  return null;
}


