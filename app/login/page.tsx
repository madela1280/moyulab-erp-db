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
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-100">
      <div className="w-full max-w-sm bg-white p-8 rounded-lg shadow-md border border-gray-200">
        <div className="flex items-center gap-3 justify-center mb-6">
          <Image
            src="/logo.png"
            alt="moulab logo"
            width={63}
            height={63}
            priority
          />
          <h1 className="text-[2rem] font-bold text-gray-500">
            moulab ERP
          </h1>
        </div>

        <div className="space-y-3 mb-4">
          <input
            type="text"
            placeholder="아이디"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-full border rounded px-3 py-2 bg-gray-50"
          />

          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            className="w-full border rounded px-3 py-2 bg-gray-50"
          />
        </div>

        <label className="flex items-center text-sm mb-6">
          <input
            type="checkbox"
            className="mr-2"
            checked={rememberId}
            onChange={(e) => setRememberId(e.target.checked)}
          />
          아이디 저장
        </label>

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





