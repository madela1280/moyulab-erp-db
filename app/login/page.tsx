'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type ApiResp =
  | { ok: true; role: 'admin' | 'user'; username: string }
  | { ok: false; error?: string; message?: string };

export default function LoginPage() {
  const router = useRouter();

  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [rememberId, setRememberId] = useState(false);
  const [busy, setBusy] = useState(false);

  // ✅ 저장된 ID (sessionStorage 사용 — 임시 편의 기능)
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
        credentials: 'include', // 서버 세션 쿠키
        body: JSON.stringify({ username: userId.trim(), password }),
      });

      const data: ApiResp = await resp.json();

      if (!data.ok) {
        alert(data.message || data.error || '로그인 실패');
        return;
      }

      // ✅ ID 저장
      if (rememberId) sessionStorage.setItem('remember_user', userId.trim());
      else sessionStorage.removeItem('remember_user');

      // 로그인 성공 → 홈
      router.replace('/');
    } catch {
      alert('서버와 통신할 수 없습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-start justify-center bg-gray-100 pt-24">
      {/* 로그인 박스 */}
      <div className="w-full max-w-sm rounded-lg p-6 bg-gray-100">

        {/* 로고 + 텍스트 가로 배치 */}
        <div className="flex items-center gap-3 mb-6">
          <Image
            src="/logo.png"
            alt="moulab logo"
            width={63}
            height={63}
            priority
            className="rounded-sm select-none"
          />
          <h1 className="text-[2.16rem] leading-tight font-bold text-gray-400 select-none">
            moulab ERP
          </h1>
        </div>

        {/* 아이디 입력 */}
        <div className="mb-3">
          <input
            className="w-full border rounded px-3 py-2 bg-white text-gray-800"
            type="text"
            placeholder="아이디"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          />
        </div>

        {/* 비밀번호 입력 */}
        <div className="mb-3">
          <input
            className="w-full border rounded px-3 py-2 bg-white text-gray-800"
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleLogin();
            }}
          />
        </div>

        {/* 아이디 저장 */}
        <label className="flex items-center text-sm mb-4 select-none text-gray-700">
          <input
            type="checkbox"
            className="mr-2"
            checked={rememberId}
            onChange={(e) => setRememberId(e.target.checked)}
          />
          아이디 저장
        </label>

        {/* 로그인 버튼 */}
        <button
          onClick={handleLogin}
          disabled={busy}
          className="w-full py-2 rounded bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-60"
        >
          {busy ? '로그인 중…' : '로그인'}
        </button>
      </div>
    </div>
  );
}




