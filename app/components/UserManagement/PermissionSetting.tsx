'use client';

import React, { useEffect, useState } from 'react';
import LockScreen from './LockScreen';
import { getCurrentUser, isAdmin } from '@/lib/permissions';

type Perm = { r: boolean; w: boolean };
type User = { username: string; name: string; phone?: string };

async function fetchUsers(): Promise<User[]> {
  const res = await fetch('/api/users/list', { cache: 'no-store' });
  const data = await res.json();
  return data.ok ? data.rows.filter((u: any) => u.username !== 'medela1280') : [];
}

async function fetchPermissions(username: string): Promise<Record<string, Perm>> {
  const res = await fetch(`/api/permissions?username=${username}`);
  const data = await res.json();
  if (!data.ok) return {};
  const result: Record<string, Perm> = {};
  for (const p of data.rows) result[p.view_key] = { r: p.can_read, w: p.can_write };
  return result;
}

async function savePermissions(username: string, perms: Record<string, Perm>) {
  await fetch('/api/permissions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, perms }),
  });
}

const TOP_MENUS = [
  '사용자관리',
  '통합관리',
  '기기관리',
  '데이터업로드',
  '대여관리',
  '유축기현황',
  '문자',
  '합포장',
  '집계',
];

export default function PermissionSetting() {
  const me = getCurrentUser();
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUsername, setSelectedUsername] = useState('');
  const [permDraft, setPermDraft] = useState<Record<string, Perm>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchUsers().then(setUsers);
  }, []);

  useEffect(() => {
    if (!selectedUsername) return;

    setLoading(true);

    fetchPermissions(selectedUsername).then((current) => {
      const initial: Record<string, Perm> = {};

      TOP_MENUS.forEach((top) => {
        initial[top] = {
          r: current[top]?.r ?? false,
          w: current[top]?.w ?? false,
        };
      });

      setPermDraft(initial);
      setLoading(false);
    });
  }, [selectedUsername]);

  if (!me || !isAdmin(me)) return <LockScreen />;

  return (
    <div className="p-4">
      <div className="mx-auto w-[70%] space-y-4">
        <h1 className="text-xl font-semibold">권한 설정</h1>

        <div>
          <label className="text-sm text-gray-600">사용자 선택</label>
          <select
            className="w-full border rounded p-2"
            value={selectedUsername}
            onChange={(e) => setSelectedUsername(e.target.value)}
          >
            <option value="" disabled>
              사용자를 선택하세요
            </option>
            {users.map((u) => (
              <option key={u.username} value={u.username}>
                {u.name}
                {u.phone ? ` (${u.phone})` : ''}
              </option>
            ))}
          </select>
        </div>

        {selectedUsername && !loading && (
          <div className="overflow-auto border rounded">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-3 py-2 text-left">대카테고리</th>
                  <th className="px-3 py-2 text-center">읽기</th>
                  <th className="px-3 py-2 text-center">쓰기</th>
                </tr>
              </thead>
              <tbody>
                {TOP_MENUS.map((key) => {
                  const val = permDraft[key] ?? { r: false, w: false };
                  return (
                    <tr key={key} className="border-t">
                      <td className="px-3 py-2">{key}</td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={val.r}
                          onChange={(e) =>
                            setPermDraft({
                              ...permDraft,
                              [key]: { ...val, r: e.target.checked },
                            })
                          }
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={val.w}
                          onChange={(e) =>
                            setPermDraft({
                              ...permDraft,
                              [key]: { ...val, w: e.target.checked },
                            })
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="p-3 flex justify-end">
              <button
                className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                onClick={async () => {
                  await savePermissions(selectedUsername, permDraft);
                  alert('권한이 저장되었습니다.');
                }}
              >
                저장
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

