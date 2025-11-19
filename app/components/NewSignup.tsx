'use client';

import React, { useState } from 'react';

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

      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || '등록 실패');

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
    <div className="bg-white border rounded sh
