'use client';

import { useEffect, useState } from 'react';

type AdminConfig = {
  masterName: string;
  companyName: string;
  hotline: string;
};

export default function AdminSetting() {
  const [cfg, setCfg] = useState<AdminConfig>({
    masterName: '',
    companyName: '',
    hotline: '',
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    try {
      const r = await fetch('/api/admin-setting', { cache: 'no-store' });
      const data = await r.json();
      if (data.ok) setCfg(data.data);
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    await fetch('/api/admin-setting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    });
    alert('저장되었습니다');
  };

  if (loading) return <div className="p-4 text-gray-500">불러오는 중…</div>;

  return (
    <div className="bg-white p-6 rounded shadow w-[420px]">
      <h2 className="text-lg font-semibold mb-4">관리자 설정</h2>

      <div className="space-y-3 text-sm">
        <div>
          <label className="block mb-1">회사명</label>
          <input
            className="w-full border rounded px-3 py-2"
            value={cfg.companyName}
            onChange={(e) => setCfg({ ...cfg, companyName: e.target.value })}
          />
        </div>

        <div>
          <label className="block mb-1">마스터 이름</label>
          <input
            className="w-full border rounded px-3 py-2"
            value={cfg.masterName}
            onChange={(e) => setCfg({ ...cfg, masterName: e.target.value })}
          />
        </div>

        <div>
          <label className="block mb-1">대표 연락처</label>
          <input
            className="w-full border rounded px-3 py-2"
            value={cfg.hotline}
            onChange={(e) => setCfg({ ...cfg, hotline: e.target.value })}
          />
        </div>

        <button
          onClick={save}
          className="w-full mt-4 bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
        >
          저장
        </button>
      </div>
    </div>
  );
}
