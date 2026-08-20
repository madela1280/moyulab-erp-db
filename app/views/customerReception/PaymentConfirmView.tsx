// app/views/customerReception/PaymentConfirmView.tsx
//
// 고객접수 > 입금확인
// ⚠ 껍데기 단계: payment_orders 테이블/API가 아직 없어 항상 빈 목록으로 표시된다.
// 테이블 생성 + 목록/확인 API 추가 시 usePaymentConfirm 훅만 채우면 이 화면은 그대로 동작한다.
"use client";

import PaymentConfirmHeader from "@/customerReception/payment-confirm/PaymentConfirmHeader";
import PaymentConfirmTable from "@/customerReception/payment-confirm/PaymentConfirmTable";
import { usePaymentConfirm } from "@/customerReception/payment-confirm/usePaymentConfirm";

export default function PaymentConfirmView() {
  const {
    rows,
    loading,
    keyword,
    setKeyword,
    selectedIds,
    setSelectedIds,
    confirmSelected,
  } = usePaymentConfirm();

  return (
    <div className="w-full h-full flex flex-col p-3 gap-3 bg-white">
      <PaymentConfirmHeader
        keyword={keyword}
        onKeywordChange={setKeyword}
        selectedCount={selectedIds.size}
        onConfirm={confirmSelected}
      />

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
