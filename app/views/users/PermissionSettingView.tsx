'use client';

import { useEffect, useState } from 'react';
import NoAccess from '@/components/NoAccess';
import { TOP_MENUS } from '@/menus/topMenus';

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

type PermMap = Record<string, { can_read: boolean; can_write: boolean }>;

export default function PermissionSettingView() {
  const [authStatus, setAuthStatus] = useState<'loading' | 'allowed' | 'denied'>(
    'loading'
  );

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);

  const [permMap, setPermMap] = useState<PermMap>({});
  const [loadingPerms, setLoadingPerms] = useState(false);
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

  /* ---------------- 권한 로딩 ---------------- */

  async function loadPermissions(username: string) {
    setLoadingPerms(true);
    try {
      const res = await fetch(
        `/api/permissions?username=${encodeURIComponent(username)}`,
        { cache: 'no-store' }
      );
      const data = (await res.json()) as any;
      if (res.ok && data?.ok) {
        setPermMap(data.permissions as PermMap);
      } else {
        setPermMap({});
      }
    } catch (e) {
      console.error('loadPermissions error:', e);
      setPermMap({});
    } finally {
      setLoadingPerms(false);
    }
  }

  /* ---------------- 권한 저장 (개별 메뉴 즉시 반영) ---------------- */

  async function togglePerm(
    menuKey: string,
    field: 'can_read' | 'can_write',
    value: boolean
  ) {
    if (!selectedUser) return;
    setSaving(true);
    try {
      const current = permMap[menuKey] || { can_read: false, can_write: false };
      const newPerm = { ...current, [field]: value };
      const body = {
        username: selectedUser,
        menu_key: menuKey,
        can_read: newPerm.can_read,
        can_write: newPerm.can_write,
      };

      const res = await fetch('/api/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok || !data?.ok) {
        alert('권한 저장에 실패했습니다.');
        return;
      }

      // 서버 저장 성공 시 로컬 상태 갱신
      setPermMap((prev) => {
        const next = { ...prev };
        if (!newPerm.can_read && !newPerm.can_write) {
          // 둘 다 false면 제거
          delete next[menuKey];
        } else {
          next[menuKey] = newPerm;
        }
        return next;
      });
    } catch (e) {
      console.error('togglePerm error:', e);
      alert('권한 저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  }

  /* ---------------- 렌더링 ---------------- */

  if (authStatus === 'loading') {
    return <div className="px-2 py-2 text-sm text-gray-500">Loading...</div>;
  }

  if (authStatus === 'denied') {
    return <NoAccess menuLabel="권한설정" />;
  }

  return (
    <div className="px-4 py-3 text-sm text-gray-700 flex gap-6">
      {/* 왼쪽: 사용자 리스트 */}
      <div className="w-1/3 border rounded bg-white p-3">
        <div className="font-semibold mb-2">사용자 목록</div>
        {loadingUsers ? (
          <div className="text-gray-500 text-xs">목록을 불러오는 중...</div>
        ) : users.length === 0 ? (
          <div className="text-gray-400 text-xs">등록된 사용자가 없습니다.</div>
        ) : (
          <ul className="text-xs max-h-[400px] overflow-auto">
            {users.map((u) => (
              <li key={u.id}>
                <button
                  className={`w-full text-left px-2 py-1 rounded ${
                    selectedUser === u.username
                      ? 'bg-blue-100 text-blue-800'
                      : 'hover:bg-gray-100'
                  }`}
                  onClick={() => {
                    setSelectedUser(u.username);
                    loadPermissions(u.username);
                  }}
                >
                  <span className="font-semibold">{u.username}</span>
                  {u.name && <span className="ml-1 text-gray-500">({u.name})</span>}
                  <span className="ml-2 text-gray-400">[{u.role}]</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 오른쪽: 선택된 사용자 권한 설정 */}
      <div className="w-2/3 border rounded bg-white p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold">
            권한 설정
            {selectedUser && (
              <span className="ml-2 text-blue-700 text-xs">
                ({selectedUser} 사용자)
              </span>
            )}
          </div>
          {saving && (
            <div className="text-xs text-gray-500">저장 중...</div>
          )}
        </div>

        {!selectedUser ? (
          <div className="text-gray-400 text-xs">
            왼쪽에서 사용자를 선택하면 대카테고리별 권한을 설정할 수 있습니다.
          </div>
        ) : loadingPerms ? (
          <div className="text-gray-500 text-xs">권한 정보를 불러오는 중...</div>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-2 py-1 w-40">대카테고리</th>
                <th className="border px-2 py-1 w-20">읽기</th>
                <th className="border px-2 py-1 w-20">쓰기</th>
              </tr>
            </thead>
            <tbody>
              {TOP_MENUS.map((menu) => {
                // 필요하면 여기서 "사용자관리"는 항상 읽기/쓰기 허용하거나 별도 처리 가능
                const p = permMap[menu] || {
                  can_read: false,
                  can_write: false,
                };
                return (
                  <tr key={menu}>
                    <td className="border px-2 py-1">{menu}</td>
                    <td className="border px-2 py-1 text-center">
                      <input
                        type="checkbox"
                        checked={p.can_read}
                        onChange={(e) =>
                          togglePerm(menu, 'can_read', e.target.checked)
                        }
                      />
                    </td>
                    <td className="border px-2 py-1 text-center">
                      <input
                        type="checkbox"
                        checked={p.can_write}
                        onChange={(e) =>
                          togglePerm(menu, 'can_write', e.target.checked)
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

