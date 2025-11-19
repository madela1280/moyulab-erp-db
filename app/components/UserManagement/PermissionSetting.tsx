'use client';

import React, { useEffect, useMemo, useState } from 'react';
import LockScreen from './LockScreen';
import { getCurrentUser, isAdmin } from '@/app/lib/permissions';
import { VIEW_MAP, MENUS } from '../AppShell';

/* API 호출 */
async function fetchUsers() {
  const res = await fetch('/api/users/list', { cache: 'no-store' });
  const data = await res.json();
  return data.ok ? data.rows.filter((u: any) => u.username !== 'medela1280') : [];
}

async function fetchPermissions(username: string) {
  const res = await fetch(`/api/permissions?username=${username}`);
  const data = await res.json();
  if (!data.ok) return {};
  const result: Record<string, { r: boolean; w: boolean }> = {};
  for (const p of data.rows) result[p.view_key] = { r: p.can_read, w: p.can_write };
  return result;
}

async function savePermissions(username: string, perms: Record<string, { r: boolean; w: boolean }>) {
  await fetch('/api/permissions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, perms }),
  });
}

function extractTop() {
  return MENUS.map((m) => m.label).filter((l) => l !== '사용자관리');
}

export default function PermissionSetting() {
  const me = getCurrentUser();
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUsername, setSelectedUsername] = useState('');
  const [permDraft, setPermDraft] = useState<Record<string, { r: boolean; w: boolean }>>({});
  const [loading, setLoading] = useState(false);

  const topKeys = useMemo(extractTop, []);

  useEffect(() => {
    fetchUsers().then(setUsers);
  }, []);

  useEffect(() => {
    if (!selectedUsername) return;
    setLoading(true);
    fetchPermissions(selectedUsername).then((current) => {
      const initial = topKeys.reduce((acc, top) => {
        const childKeys = Object.keys(VIEW_MAP).filter((v) => v.startsWith(top + '>'));
        const hasRead = childKeys.some((k) => current[k]?.r) || current[top]?.r;
        const hasWrite = childKeys.some((k) => current[k]?.w) || current[top]?.w;
        acc[top] = { r: !!hasRead, w: !!hasWrite };
        return acc;
      }, {} as any);
      setPermDraft(initial);
      setLoading(false);
    });
  }, [selectedUsername, topKeys]);

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
              </option>
            ))}
          </select>
        </div>

        {selectedUsername && !loading && (
          <div className="overflow-auto border rounded">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100">
