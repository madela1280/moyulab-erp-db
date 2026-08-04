"use client";

import { useState } from "react";
import ReturnRecoveryHeader from "@/views/dataUpload/return-recovery/ReturnRecoveryHeader";
import ReturnRecoveryGrid from "@/views/dataUpload/return-recovery/ReturnRecoveryGrid";
import ReturnRequestDateModal from "@/views/dataUpload/return-recovery/ReturnRequestDateModal";

export default function ReturnRecoveryView() {
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [selectedReturnRequestDate, setSelectedReturnRequestDate] = useState("");

  return (
    <div className="w-full h-full flex flex-col p-3 gap-3 bg-white">
      <ReturnRecoveryHeader onOpenReturnRequestDate={() => setDateModalOpen(true)} />

      {selectedReturnRequestDate && (
        <div className="text-xs text-slate-600">
          선택한 반납요청일: <span className="font-semibold text-slate-800">{selectedReturnRequestDate}</span>
        </div>
      )}

      <ReturnRecoveryGrid />

      <ReturnRequestDateModal
        open={dateModalOpen}
        onClose={() => setDateModalOpen(false)}
        onConfirm={(dateText) => {
          setSelectedReturnRequestDate(dateText);
          setDateModalOpen(false);
        }}
      />
    </div>
  );
}