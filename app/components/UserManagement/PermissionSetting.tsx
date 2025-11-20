'use client';

import React, { useEffect, useMemo, useState } from 'react';
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

function extractTopLevelKeys(): string[] {
  return MENUS.filter(m => !m.startsWith('사용자관리'));
}

export default function PermissionSetting() {
  const me = getCurrentUser();
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUsername, setSelectedUsername] = useState('');
  const [permDraft, setPermDraft] = useState<Record<string, Perm>>({});
  const [loading, setLoading] = useState(false);

  const topLevelKeys = useMemo(extractTopLevelKeys, []);

  useEffect(() => {
    fetchUsers().then(setUsers);
  }, []);

  useEffect(() => {
    if (!selectedUsername) return;
    setLoading(true);
    fetchPermissions(selectedUsername).then((current) => {
      const initial = topLevelKeys.reduce((acc, top) => {
        const childKeys = Object.keys(VIEW_MAP).filter(v => v.startsWith(top + '>'));
        const hasRead = childKeys.some(k => current[k]?.r) || current[top]?.r;
        const hasWrite = childKeys.some(k => current[k]?.w) || current[top]?.w;
        acc[top] = { r: !!hasRead, w: !!hasWrite };
        return acc;
      }, {} as Record<string, Perm>);
      setPermDraft(initial);
      setLoading(false);
    });
  }, [selectedUsername, topLevelKeys]);

  if (!me || !isAdmin(me)) return <LockScreen />;

  return (
    <div className="p-4">
      <div className="mx-auto w-[70%] space-y-4">
        <h1 className="text-xl font-semibold">권한 설정 (DB 기반)</h1>

        <div>
          <label className="text-sm text-gray-600">사용자 선택</label>
          <select
            className="w-full border rounded p-2"
            value={selectedUsername}
            onChange={(e) => setSelectedUsername(e.target.value)}
          >
            <option value="" disabled>사용자를 선택하세요</option>
            {users.map(u => (
              <option key={u.username} value={u.username}>
                {u.name}{u.phone ? ` (${u.phone})` : ''}
              </option>
            ))}
          </select>
        </div>

        {selectedUsername && !loading && (
          <div className="overflow-auto border rounded">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left px-3 py-2">대카테고리</th>
                  <th className="text-center px-3 py-2">읽기</th>
                  <th className="text-center px-3 py-2">쓰기</th>
                </tr>
              </thead>
              <tbody>
                {topLevelKeys.map((key) => {
                  const val = permDraft[key] ?? { r: false, w: false };
                  return (
                    <tr key={key} className="border-t">
                      <td className="px-3 py-2">{key}</td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={val.r}
                          onChange={(e) =>
                            setPermDraft({ ...permDraft, [key]: { ...val, r: e.target.checked } })
                          }
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={val.w}
                          onChange={(e) =>
                            setPermDraft({ ...permDraft, [key]: { ...val, w: e.target.checked } })
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="p-3 flex justify-end gap-2">
              <button
                className="px-3 py-2 border rounded bg-blue-600 text-white hover:bg-blue-700"
                onClick={async () => {
                  const merged: Record<string, Perm> = {};
                  topLevelKeys.forEach(top => {
                    const t = permDraft[top] ?? { r: false, w: false };
                    merged[top] = { r: t.r, w: t.w };
                    const childKeys = Object.keys(VIEW_MAP).filter(k => k.startsWith(top + '>'));
                    childKeys.forEach(k => { merged[k] = { r: t.r, w: t.w }; });
                  });
                  await savePermissions(selectedUsername, merged);
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
