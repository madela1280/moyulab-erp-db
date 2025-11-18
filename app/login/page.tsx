'use client';

import Image from 'next/image';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type ApiResp =
  | { ok: true; role: 'admin' | 'user'; username: string }
  | { ok: false; error?: string; message?: string };

export default function LoginPage() {
  const router = useRouter();

  // 기본값 자동 입력 (너 요청)
  const [userId, setUserId] = useState('medela1280');
  const [password, setPassword] = useState('12345');

  const [rememberId, setRememberId] = useState(false);
  const [busy, setBusy] = useState(false);

  // 기존 흐름 그대로 유지 (아이디 기억 기능)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('erp_user');
      if (saved) {
        setUserId(saved);
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
        body: JSON.stringify({
          username: userId.trim(),
          password: password
        }),
      });

      const data: ApiResp = await resp.json();

      if (!data.ok) {
        alert(data.message || data.error || '로그인 실패');
        return;
      }

      // 기존 흐름 — 아이디 저장
      if (rememberId) localStorage.setItem('erp_user', userId.trim());
      else localStorage.removeItem('erp_user');

      router.replace('/');
    } catch (e) {
      console.error(e);
      alert('서버와 통신할 수 없습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#eef0f4]">
      <div className="w-full max-w-sm p-6 bg-[#eef0f4]">

        {/* 로고 + 타이틀 */}
        <div className="flex items-center gap-3 mb-6">
          <Image
            src="/logo.png"
            alt="moulab logo"
            width={63}
            height={63}
            priority
            className="rounded-sm"
          />
          <h1 className="text-[2.16rem] font-bold text-gray-500 leading-tight">
            moulab ERP
          </h1>
        </div>

        {/* 아이디 */}
        <div className="mb-3">
          <input
            type="text"
            placeholder="아이디"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 bg-white"
          />
        </div>

        {/* 비밀번호 */}
        <div className="mb-3">
          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            className="w-full border border-gray-300 rounded px-3 py-2 bg-white"
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




