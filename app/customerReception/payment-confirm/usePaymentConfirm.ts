// app/customerReception/payment-confirm/usePaymentConfirm.ts
"use client";

import { useEffect, useMemo, useState } from "react";
import type { PaymentOrderRow } from "@/customerReception/payment-confirm/types";

export function usePaymentConfirm() {
  const [rows, setRows] = useState<PaymentOrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  async function loadRows() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/customer-reception/payment-confirm", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "입금대기 목록을 불러오지 못했습니다.");

      setRows(Array.isArray(data.rows) ? data.rows : []);
      setSelectedIds(new Set());
    } catch (e: any) {
      setError(e?.message || "입금대기 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRows();
  }, []);

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
    if (selectedIds.size === 0) return;
    if (!window.confirm(`선택한 ${selectedIds.size}건을 입금확인 처리하시겠습니까?`)) return;

    setError("");
    try {
      const res = await fetch("/api/customer-reception/payment-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "입금확인 처리하지 못했습니다.");

      await loadRows();
    } catch (e: any) {
      setError(e?.message || "입금확인 처리하지 못했습니다.");
    }
  }

  return {
    rows: filteredRows,
    loading,
    error,
    keyword,
    setKeyword,
    selectedIds,
    setSelectedIds,
    confirmSelected,
    refresh: loadRows,
  };
}
