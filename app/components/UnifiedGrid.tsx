'use client';

import React, { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';

const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL!, {
  transports: ['websocket'],
  withCredentials: true,
});

type Row = { id: number; data: any };

export default function UnifiedGrid({ viewId }: { viewId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const saving = useRef(false);

  useEffect(() => {
    socket.emit('join', 'global');

    socket.on('unified:update', () => {
      load();
    });

    return () => {
      socket.off('unified:update');
    };
  }, []);

  const load = async () => {
    try {
      const r = await fetch('/api/unified', { cache: 'no-store' });
      const data = await r.json();
      setRows(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const update = async (id: number, next: any) => {
    if (saving.current) return;
    saving.current = true;

    await fetch(`/api/unified/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    });

    saving.current = false;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-gray-500">
        데이터를 불러오는 중입니다...
      </div>
    );
  }

  return (
    <div className="bg-white border rounded shadow-sm p-3">
      <div className="font-semibold mb-3">{viewId}</div>

      <table className="min-w-full border text-sm">
        <thead className="bg-gray-100">
          <tr>
            <th className="border px-2 py-1 w-12">ID</th>
            <th className="border px-2 py-1">JSON Data</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="border px-2 py-1 text-center">{r.id}</td>
              <td className="border px-2 py-1">
                <textarea
                  className="w-full h-32 border rounded p-2 text-xs font-mono"
                  defaultValue={JSON.stringify(r.data, null, 2)}
                  onBlur={(e) => {
                    try {
                      const json = JSON.parse(e.target.value);
                      update(r.id, json);
                    } catch {}
                  }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
