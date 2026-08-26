// app/views/customerReception/PaymentConfirmView.tsx
//
// 고객접수 > 입금확인. payment_orders 전체 목록을 보여준다.
// 문자 매칭(app/api/sms/inbound)이 곧바로 status='confirmed'까지 자동 확정하므로
// 이 화면엔 "확인" 액션이 없다 — 체크한 건을 정리(삭제)만 한다.
"use client";

import PaymentConfirmHeader from "@/customerReception/payment-confirm/PaymentConfirmHeader";
import PaymentConfirmTable from "@/customerReception/payment-confirm/PaymentConfirmTable";
import { usePaymentConfirm } from "@/customerReception/payment-confirm/usePaymentConfirm";

export default function PaymentConfirmView() {
  const {
    rows,
    loading,
    error,
    keyword,
    setKeyword,
    selectedIds,
    setSelectedIds,
    deleteSelected,
    refresh,
  } = usePaymentConfirm();

  return (
    <div className="w-full h-full flex flex-col p-3 gap-3 bg-white">
      <PaymentConfirmHeader
        keyword={keyword}
        onKeywordChange={setKeyword}
        selectedCount={selectedIds.size}
        loading={loading}
        onRefresh={refresh}
        onDelete={deleteSelected}
      />

      {error && <div className="text-xs text-red-600">{error}</div>}

      <div className="flex-1 min-h-0 border rounded bg-white overflow-hidden">
        <PaymentConfirmTable
          loading={loading}
          rows={rows}
          selectedIds={selectedIds}
          onSelectedIdsChange={setSelectedIds}
        />
      </div>
    </div>
  );
}
