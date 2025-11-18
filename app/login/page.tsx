'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type ApiResp =
  | { ok: true; role: 'admin' | 'user'; username: string }
  | { ok: false; error?: string; message?: string };

export default function LoginPage() {
  const router = useRouter();

  // ✅ 기본값 자동 입력 (요청사항: 관리자 테스트용)
  const [userId, setUserId] = useState('medela1280');
  const [password, setPassword] = useState('12345');

  const [rememberId, setRememberId] = useState(false);
  const [busy, setBusy] = useState(false);

  // ✅ ID 자동 저장(sessionStorage) – 기존 흐름 유지
  useEffect(() => {
    try {
      const savedId = sessionStorage.getItem('remember_user');
      if (savedId) {
        setUserId(savedId);
        setRememberId(true);
      }
    } catch {}
  }, []);

  const handleLogin = async () => {
    if (!userId || !password) {
      alert('아이디와 비밀번호를 입력하세요.');
      return;
    }

    setBusy(true);
    try {
      const resp = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username: userId.trim(), password }),
      });

      const data: ApiResp = await resp.json();
      if (!data.ok) {
        alert(data.message || data.error || '로그인 실패');
        return;
      }

      if (rememberId) sessionStorage.setItem('remember_user', userId.trim());
      else sessionStorage.removeItem('remember_user');

      router.replace('/');
    } catch {
      alert('서버와 통신할 수 없습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="bg-white p-10 rounded-2xl shadow-lg flex flex-col items-center text-gray-800 w-[440px]">
        {/* 로고 + 타이틀 */}
        <div className="flex flex-col items-center mb-8">
          <Image
            src="/logo.png"
            alt="moulab logo"
            width={65}
            height={65}
            priority
            className="select-none mb-3"
          />
          <h1 className="text-[2.5rem] font-extrabold text-gray-700 select-none">
            moulab ERP
          </h1>
        </div>

        {/* 아이디 입력 */}
        <input
          type="text"
          placeholder="아이디"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-3 mb-3 text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 outline-none transition text-lg"
        />

        {/* 비밀번호 입력 */}
        <input
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          className="w-full border border-gray-300 rounded-md px-3 py-3 mb-4 text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 outline-none transition text-lg"
        />

        {/* 아이디 저장 */}
        <label className="flex items-center text-base mb-5 text-gray-700 w-full">
          <input
            type="checkbox"
            className="mr-2 accent-blue-600"
            checked={rememberId}
            onChange={(e) => setRememberId(e.target.checked)}
          />
          아이디 저장
        </label>

        {/* 로그인 버튼 */}
        <button
          onClick={handleLogin}
          disabled={busy}
          className="w-full py-3 rounded-md bg-blue-600 text-white font-bold text-lg hover:bg-blue-700 disabled:opacity-60 transition border border-blue-700"
        >
          {busy ? '로그인 중…' : '로그인'}
        </button>
      </div>
    </main>
  );
}






