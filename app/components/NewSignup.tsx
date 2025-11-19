'use client';

import React, { useState } from 'react';

/**
 * ✅ DB 전용 신규가입 폼 (통합관리 자동전송 포함)
 */
export default function NewSignup() {
  const [form, setForm] = useState({
    name: '',
    phone: '',
    vendor: '',
    product: '',
    serial: '',
    startDate: '',
    endDate: '',
  });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const handleChange = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    setMsg(null);
    if (!form.name.trim() || !form.phone.trim()) {
      setMsg('⚠️ 이름과 전화번호를 입력하세요.');
      return;
    }
    try {
      setLoading(true);

      // 1️⃣ 신규가입 DB 저장
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || '등록 실패');

      // 2️⃣ 통합관리로 자동 전송
      const res2 = await fetch('/api/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          viewId: '통합관리',
          record: form,
        }),
      });
      const result2 = await res2.json();

      if (result2.ok) {
        setMsg('✅ 신규가입이 완료되어 통합관리에 전송되었습니다.');
        setForm({
          name: '',
          phone: '',
          vendor: '',
          product: '',
          serial: '',
          startDate: '',
          endDate: '',
        });
      } else {
        setMsg(
          '❌ 전송 실패: ' +
            (result2.error === 'duplicate'
              ? '기기번호 중복으로 전송되지 않았습니다.'
              : result2.error === 'unregistered'
              ? '미등록 기기입니다.'
              : '서버 오류')
        );
      }
    } catch (err) {
      console.error(err);
      setMsg('❌ 서버 통신 오류');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border rounded shadow p-6 max-w-[480px] mx-auto mt-8">
      <h2 className="text-lg font-semibold mb-4">신규 가입 등록</h2>
      <div className="space-y-3 text-sm">
        <input
          className="w-full border rounded px-3 py-2"
          placeholder="이름"
          value={form.name}
          onChange={(e) => handleChange('name', e.target.value)}
        />
        <input
          className="w-full border rounded px-3 py-2"
          placeholder="전화번호"
          value={form.phone}
          onChange={(e) => handleChange('phone', e.target.value)}
        />
        <input
          className="w-full border rounded px-3 py-2"
          placeholder="거래처명"
          value={form.vendor}
          onChange={(e) => handleChange('vendor', e.target.value)}
        />
        <input
          className="w-full border rounded px-3 py-2"
          placeholder="제품명"
          value={form.product}
          onChange={(e) => handleChange('product', e.target.value)}
        />
        <input
          className="w-full border rounded px-3 py-2"
          placeholder="기기번호"
          value={form.serial}
          onChange={(e) => handleChange('serial', e.target.value)}
        />

        <div className="flex gap-2">
          <input
            type="date"
            className="w-1/2 border rounded px-3 py-2"
            value={form.startDate}
            onChange={(e) => handleChange('startDate', e.target.value)}
          />
          <input
            type="date"
            className="w-1/2 border rounded px-3 py-2"
            value={form.endDate}
            onChange={(e) => handleChange('endDate', e.target.value)}
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading}
          className={`w-full py-2 rounded text-white ${
            loading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {loading ? '저장 중…' : '등록 및 전송'}
        </button>

        {msg && (
          <p
            className={`text-center mt-2 text-sm ${
              msg.includes('✅')
                ? 'text-green-600'
                : msg.includes('⚠️')
                ? 'text-orange-600'
                : 'text-red-600'
            }`}
          >
            {msg}
          </p>
        )}
      </div>
    </div>
  );
}
