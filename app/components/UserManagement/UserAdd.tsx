'use client';

import { useEffect, useState } from 'react';
import LockScreen from './LockScreen';
import { getCurrentUser, isAdmin } from '@/app/lib/permissions';

type User = { username: string; name: string; phone: string; role: string };

export default function UserAdd() {
  const me = getCurrentUser();
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [editUser, setEditUser] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  if (!me || !isAdmin(me)) return <LockScreen />;

  const loadUsers = async () => {
    try {
      const res = await fetch('/api/users/list', { cache: 'no-store' });
      const data = await res.json();
      if (data.ok) setUsers(data.rows.filter((u: any) => u.username !== 'medela1280'));
      else setStatus('사용자 목록 불러오기 실패');
    } catch {
      setStatus('서버 오류');
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const resetForm = () => {
    setName('');
    setPhone('');
    setUsername('');
    setPassword('');
    setPassword2('');
    setEditUser(null);
    setStatus(null);
  };

  const handleSave = async () => {
    if (!name.trim() || !phone.trim() || !username.trim()) {
      setStatus('이름/전화/아이디를 모두 입력하세요.');
      return;
    }
    if (!editUser && !password) {
      setStatus('비밀번호를 입력하세요.');
      return;
    }
    if (password && password !== password2) {
      setStatus('비밀번호가 일치하지 않습니다.');
      return;
    }

    try {
      const body = {
        username,
        password,
        name,
        phone,
        role: 'user',
      };
      const res = await fetch('/api/users/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.ok) {
        setStatus('저장 실패');
        return;
      }
      await loadUsers();
      resetForm();
      setStatus(editUser ? '수정 완료' : '사용자 추가 완료');
    } catch {
      setStatus('서버 오류');
    }
  };

  const handleDelete = async () => {
    if (!editUser) {
      setStatus('삭제할 사용자를 먼저 선택하세요.');
      return;
    }
    if (!confirm(`정말 삭제하시겠습니까?\n사용자: ${editUser}`)) return;

    try {
      const res = await fetch(`/api/users/delete?username=${editUser}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.ok) {
        setStatus('삭제 실패');
        return;
      }
      await loadUsers();
      resetForm();
      setStatus('삭제 완료');
    } catch {
      setStatus('서버 오류');
    }
  };

  return (
    <div className="p-4">
      <div className="mx-auto w-[70%]">
        <div className="grid gap-4 [grid-template-columns:0.35fr_0.65fr]">
          <div>
            <h3 className="font-semibold mb-4">{editUser ? '사용자 수정' : '사용자 추가'}</h3>

            <div className="space-y-3">
              <input
                className="w-full border rounded px-3 py-2"
                placeholder="이름"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <input
                className="w-full border rounded px-3 py-2"
                placeholder="전화번호"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <input
                className="w-full border rounded px-3 py-2"
                placeholder="아이디"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                readOnly={!!editUser}
              />
              <input
                type="password"
                className="w-full border rounded px-3 py-2"
                placeholder={editUser ? '새 비밀번호 (변경 시)' : '비밀번호'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <input
                type="password"
                className="w-full border rounded px-3 py-2"
                placeholder={editUser ? '새 비밀번호 확인' : '비밀번호 확인'}
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
              />
            </div>

            {status && (
              <div
                className={`text-sm mt-3 ${
                  status.includes('실패') || status.includes('오류')
                    ? 'text-red-600'
                    : 'text-green-600'
                }`}
              >
                {status}
              </div>
            )}

            <div className="mt-4">
              <div className="flex gap-2 scale-[0.9] origin-left">
                <button
                  onClick={handleSave}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  {editUser ? '수정 저장' : '추가'}
                </button>
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 bg-gray-100 rounded border hover:bg-gray-50"
                >
                  삭제
                </button>
                <button
                  onClick={resetForm}
                  className="px-4 py-2 bg-gray-100 rounded border hover:bg-gray-50"
                >
                  새로 입력
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-5">
            <h3 className="font-semibold mb-4">사용자 목록</h3>
            <div className="divide-y">
              {users.length === 0 && (
                <div className="text-sm text-gray-500">등록된 사용자가 없습니다.</div>
              )}
              {users.map((u) => (
                <button
                  key={u.username}
                  onClick={() => {
                    setEditUser(u.username);
                    setName(u.name);
                    setPhone(u.phone);
                    setUsername(u.username);
                    setPassword('');
                    setPassword2('');
                    setStatus(null);
                  }}
                  className={`w-full text-left py-2 px-2 hover:bg-gray-50 ${
                    u.username === editUser ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="font-medium">
                    {u.name}{' '}
                    <span className="text-gray-400 text-xs">({u.username})</span>
                  </div>
                  <div className="text-xs text-gray-500">{u.phone}</div>
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}


