"use client";

import ReturnRecoveryHeader from "@/views/dataUpload/return-recovery/ReturnRecoveryHeader";
import ReturnRecoveryGrid from "@/views/dataUpload/return-recovery/ReturnRecoveryGrid";

export default function ReturnRecoveryView() {
  return (
    <div className="w-full h-full flex flex-col p-3 gap-3 bg-white">
      <ReturnRecoveryHeader />

      <ReturnRecoveryGrid />
    </div>
  );
}