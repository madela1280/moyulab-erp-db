// app/views/customerReception/PaymentConfirmView.tsx
//
// 고객접수 > 입금확인. payment_orders에서 status='waiting'/'matched'(아직 사람이 확인 안 한) 건을 보여주고,
// 체크 후 "입금확인" 누르면 status='confirmed'로 확정한다(확인한 사람은 confirmed_by에 기록).
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
    confirmSelected,
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
        onConfirm={confirmSelected}
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
