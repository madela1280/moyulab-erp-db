// app/customerReception/payment-confirm/usePaymentConfirm.ts
"use client";

import { useMemo, useState } from "react";
import type { PaymentOrderRow } from "@/customerReception/payment-confirm/types";

// ⚠ 껍데기 단계: payment_orders 테이블/조회 API가 아직 없어 항상 빈 목록.
// 테이블 생성 + 목록 API 추가 시 이 훅에서 fetch 로직만 채우면 된다(화면 쪽은 수정 불필요).
export function usePaymentConfirm() {
  const [rows] = useState<PaymentOrderRow[]>([]);
  const [loading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const filteredRows = useMemo(() => {
    const kw = keyword.trim();
    if (!kw) return rows;

    return rows.filter((r) => {
      return (
        String(r.customer_name ?? "").includes(kw) ||
        String(r.depositor_name ?? "").includes(kw) ||
        String(r.amount ?? "").includes(kw)
      );
    });
  }, [rows, keyword]);

  async function confirmSelected() {
    // ⚠ 껍데기 단계: 확인 처리 API가 아직 없음.
    alert("입금확인 처리는 payment_orders 테이블/API 준비 후 연결됩니다.");
  }

  return {
    rows: filteredRows,
    loading,
    keyword,
    setKeyword,
    selectedIds,
    setSelectedIds,
    confirmSelected,
  };
}
