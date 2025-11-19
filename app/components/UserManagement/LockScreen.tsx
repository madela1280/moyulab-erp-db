'use client';
import { useEffect, useState } from 'react';

export default function LockScreen() {
  const [masterName, setMasterName] = useState('장대윤');

  useEffect(() => {
    try {
      const n = localStorage.getItem('admin_name');
      if (n && n.trim()) setMasterName(n);
    } catch {}
  }, []);

  return (
    <div className="min-h-[calc(100vh-80px)] flex items-center justify-center">
      <div className="text-center scale-[1.25]">
        <div className="mx-auto mb-5 w-28 h-28 rounded-full bg-gray-100 flex items-center justify-center">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
            <rect x="4" y="10" width="16" height="10" rx="2" stroke="#9ca3af" strokeWidth="2"/>
            <path d="M8 10V7a4 4 0 1 1 8 0v3" stroke="#9ca3af" strokeWidth="2" />
          </svg>
        </div>
        <p className="text-base">
          <span className="text-blue-600 font-medium">메뉴 접근 권한이 없습니다.</span>
        </p>
        <p className="text-base mt-1">서비스를 이용하려면 회사 마스터에게 문의 바랍니다.</p>
        <p className="text-xl font-bold mt-2">
          우리회사마스터 : <span className="text-blue-700">{masterName}</span>
        </p>
      </div>
    </div>
  );
}

