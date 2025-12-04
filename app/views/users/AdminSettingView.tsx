'use client';

import { useEffect, useState } from 'react';
import NoAccess from '@/components/NoAccess';

type MeSuccess = {
  ok: true;
  user: { username: string; role: string; name: string; phone: string };
};

type AdminUser = {
  username: string;
  name: string | null;
  phone: string | null;
};

const MASTER_USERNAME = 'medela1280';

export default function AdminSettingView() {
  const [authStatus, setAuthStatus] = useState<'loading' | 'allowed' | 'denied'>(
    'loading'
  );

  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loadingAdmin, setLoadingAdmin] = useState(false);

  const [form, setForm] = useState({
    name: '',
    phone: '',
    password: '',
  });
  const [saving, setSaving] = useState(false);

  /* ---------------- 마스터만 허용 (username + role) ---------------- */

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
        if (
          me.user.role === 'admin' &&
          me.user.username === MASTER_USERNAME
        ) {
          if (!cancelled) setAuthStatus('allowed');
        } else {
          if (!cancelled) setAuthStatus('denied');
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

  /* ---------------- 관리자 정보 로딩 ---------------- */

  useEffect(() => {
    if (authStatus !== 'allowed') return;

    let cancelled = false;

    const loadAdmin = async () => {
      setLoadingAdmin(true);
      try {
        const res = await fetch('/api/admin', { cache: 'no-store' });
        const data = (await res.json()) as any;

        if (!res.ok || !data?.ok) {
          console.error('loadAdmin error:', data);
          return;
        }

        if (!cancelled) {
          const u = data.user as AdminUser;
          setAdmin(u);
          setForm({
            name: u.name || '',
            phone: u.phone || '',
            password: '',
          });
        }
      } catch (e) {
        console.error('loadAdmin error:', e);
      } finally {
        if (!cancelled) setLoadingAdmin(false);
      }
    };

    loadAdmin();
    return () => {
      cancelled = true;
    };
  }, [authStatus]);

  /* ---------------- 저장 ---------------- */

  async function handleSave() {
    if (!form.name.trim()) {
      alert('관리자 이름은 필수입니다.');
      return;
    }

    setSaving(true);
    try {
      const body: any = {
        name: form.name.trim(),
        phone: form.phone.trim(),
      };
      if (form.password.trim()) {
        body.password = form.password.trim();
      }

      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        alert('관리자 정보 저장에 실패했습니다.');
        console.error('save admin error:', data);
        return;
      }

      const u = data.user as AdminUser;
      setAdmin(u);
      setForm((f) => ({
        ...f,
        name: u.name || '',
        phone: u.phone || '',
        password: '',
      }));
      alert('관리자 정보를 저장했습니다.');
    } catch (e) {
      console.error('handleSave admin error:', e);
      alert('서버 오류로 관리자 정보를 저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  }

  /* ---------------- 렌더링 ---------------- */

  if (authStatus === 'loading') {
    return <div className="px-2 py-2 text-sm text-gray-500">Loading...</div>;
  }

  if (authStatus === 'denied') {
    return <NoAccess menuLabel="관리자설정" />;
  }

  // 가로 중앙 정렬(mx-auto) + 전체 글자 약 15% 확대(text-base)
  return (
    <div className="px-4 py-3 text-base text-gray-700 max-w-xl mx-auto">
      <div className="font-semibold mb-3">관리자(회사 마스터) 설정</div>

      {loadingAdmin || !admin ? (
        <div className="text-sm text-gray-500">관리자 정보를 불러오는 중...</div>
      ) : (
        <>
          <div className="mb-3">
            <label className="block text-sm mb-1">관리자 아이디</label>
            <div className="px-2 py-1 border rounded bg-gray-100 text-sm">
              {admin.username}
            </div>
          </div>

          <div className="mb-3">
            <label className="block text-sm mb-1">이름 *</label>
            <input
              className="w-full border rounded px-2 py-1 text-sm"
              value={form.name}
              onChange={(e) =>
                setForm((f) => ({ ...f, name: e.target.value }))
              }
            />
          </div>

          <div className="mb-3">
            <label className="block text-sm mb-1">연락처</label>
            <input
              className="w-full border rounded px-2 py-1 text-sm"
              value={form.phone}
              onChange={(e) =>
                setForm((f) => ({ ...f, phone: e.target.value }))
              }
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm mb-1">
              비밀번호 (변경 시에만 입력)
            </label>
            <input
              type="password"
              className="w-full border rounded px-2 py-1 text-sm"
              value={form.password}
              onChange={(e) =>
                setForm((f) => ({ ...f, password: e.target.value }))
              }
            />
            <p className="mt-1 text-xs text-gray-500">
              비밀번호를 변경하지 않으려면 빈칸으로 두세요.
            </p>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1 rounded bg-blue-600 text-white text-sm font-semibold disabled:opacity-60"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </>
      )}
    </div>
  );
}
