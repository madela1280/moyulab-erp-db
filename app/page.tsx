'use client';

import dynamic from 'next/dynamic';

// AppShell = 전체 ERP 레이아웃 (통합관리 화면 포함)
const AppShell = dynamic(() => import('./components/AppShell'), {
  ssr: false,
});

export default function Page() {
  return <AppShell />;
}
