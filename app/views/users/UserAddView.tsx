'use client';

import { useEffect, useState } from 'react';
import NoAccess from '@/components/NoAccess';

type MeSuccess = {
  ok: true;
  user: { username: string; role: string; name: string; phone: string };
};

type UserRow = {
  id: number;
  username: string;
  role: string;
  name: string | null;
  phone: string | null;
  created_at: string;
};

export default function UserAddView() {
  const [authStatus, setAuthStatus] = useState<'loading' | 'allowed' | 'denied'>(
    'loading'
  );

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const [form, setForm] = useState({
    username: '',
    password: '',
    name: '',
    phone: '',
  });
  const [saving, setSaving] = useState(false);

  /* ---------------- 인증(관리자만 허용) ---------------- */

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' });
        const data = (await res.json()) as any;

        if (!res.ok || !data?.ok) {
          if (!cancelled) setAuthStatus('denied');
          return;
        }

        const me = data as MeSuccess;
        if (!cancelled) {
          setAuthStatus(me.user.role === 'admin' ? 'allowed' : 'denied');
        }
      } catch {
        if (!cancelled) setAuthStatus('denied');
      }
    };

    check();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------------- 사용자 목록 로딩 ---------------- */

  async function loadUsers() {
    setLoadingUsers(true);
    try {
      const res = await fetch('/api/users', { cache: 'no-store' });
      const data = (await res.json()) as any;
      if (res.ok && data?.ok) {
        setUsers(data.users as UserRow[]);
      }
    } catch (e) {
      console.error('loadUsers error:', e);
    } finally {
      setLoadingUsers(false);
    }
  }

  useEffect(() => {
    if (authStatus === 'allowed') {
      loadUsers();
    }
  }, [authStatus]);

  /* ---------------- 새 사용자 추가 ---------------- */

  async function handleSave() {
    if (!form.username.trim() || !form.password.trim()) {
      alert('아이디와 비밀번호는 필수입니다.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: form.username.trim(),
          password: form.password.trim(),
          name: form.name.trim(),
          phone: form.phone.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        if (data?.error === 'duplicate_username') {
          alert('이미 존재하는 아이디입니다.');
        } else {
          alert('사용자 추가에 실패했습니다.');
        }
        return;
      }

      alert('사용자를 추가했습니다.');
      setForm({ username: '', password: '', name: '', phone: '' });
      loadUsers();
    } catch (e) {
      console.error('handleSave error:', e);
      alert('서버 오류로 사용자 추가에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  /* ---------------- 렌더링 ---------------- */

  if (authStatus === 'loading') {
    return <div className="px-2 py-2 text-sm text-gray-500">Loading...</div>;
  }

  if (authStatus === 'denied') {
    return <NoAccess menuLabel="사용자추가" />;
  }

  // 관리자일 때만 아래 화면 표시
  return (
    <div className="px-4 py-3 text-sm text-gray-700 flex gap-6">
      {/* 왼쪽: 기존 사용자 목록 */}
      <div className="w-1/2 border rounded bg-white p-3">
        <div className="font-semibold mb-2">기존 사용자</div>
        {loadingUsers ? (
          <div className="text-gray-500 text-xs">목록을 불러오는 중...</div>
        ) : users.length === 0 ? (
          <div className="text-gray-400 text-xs">등록된 사용자가 없습니다.</div>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-2 py-1 w-10">ID</th>
                <th className="border px-2 py-1">아이디</th>
                <th className="border px-2 py-1">이름</th>
                <th className="border px-2 py-1">권한</th>
                <th className="border px-2 py-1">연락처</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="border px-2 py-1 text-center">{u.id}</td>
                  <td className="border px-2 py-1">{u.username}</td>
                  <td className="border px-2 py-1">{u.name || ''}</td>
                  <td className="border px-2 py-1">{u.role}</td>
                  <td className="border px-2 py-1">{u.phone || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 오른쪽: 사용자 추가 폼 */}
      <div className="w-1/2 border rounded bg-white p-3">
        <div className="font-semibold mb-2">사용자 추가</div>

        <div className="mb-2">
          <label className="block text-xs mb-1">아이디 *</label>
          <input
            className="w-full border rounded px-2 py-1 text-xs"
            value={form.username}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
          />
        </div>

        <div className="mb-2">
          <label className="block text-xs mb-1">비밀번호 *</label>
          <input
            type="password"
            className="w-full border rounded px-2 py-1 text-xs"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          />
        </div>

        <div className="mb-2">
          <label className="block text-xs mb-1">이름</label>
          <input
            className="w-full border rounded px-2 py-1 text-xs"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>

        <div className="mb-4">
          <label className="block text-xs mb-1">연락처</label>
          <input
            className="w-full border rounded px-2 py-1 text-xs"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-1 rounded bg-blue-600 text-white text-xs font-semibold disabled:opacity-60"
        >
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>
    </div>
  );
}

