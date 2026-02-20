"use client";

import type { SmsSubCategory, SmsTargetRow } from "@/sms/types/sms.types";

export default function SmsSendPanel(_props: {
  subCategory: SmsSubCategory;
  baseDate: string;
  selectedRows: SmsTargetRow[];
  selectedCount: number;

  onSend: (opts: { scope: "all" | "selected"; dryRun: boolean }) => Promise<any>;
  onSyncResult: () => Promise<any>;
  onClearSelection: () => void;
}) {
  return (
    <div className="p-3 flex flex-col gap-3">
      <div className="text-sm font-semibold text-gray-800">발송</div>

      <div className="text-xs text-gray-700 border rounded p-3 bg-gray-50 leading-5">
        발송/결과동기화 기능은 비활성화되었습니다.
        <br />
        (정책: 05시 1회 집계 이후 데이터 변형 및 중복발송/오류 소지 제거)
      </div>
    </div>
  );
}