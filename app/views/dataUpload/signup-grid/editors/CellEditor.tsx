"use client";

import PartnerSelectCell from "@/views/dataUpload/signup-grid/editors/PartnerSelectCell";
import DateCell from "@/views/dataUpload/signup-grid/editors/DateCell";

const DATE_KEYS = new Set(["택배발송일", "신청일", "시작일", "반납요청일", "반납완료일"]);

export default function CellEditor({
  columnKey,
  value,
  onChange,
  onFocus,
}: {
  columnKey: string;
  value: string;
  onChange: (v: string) => void;
  onFocus: () => void;
}) {
  if (columnKey === "거래처분류") {
    return <PartnerSelectCell value={value} onChange={onChange} onFocus={onFocus} />;
  }

  if (DATE_KEYS.has(columnKey)) {
    return <DateCell value={value} onChange={onChange} onFocus={onFocus} />;
  }

  const isAddress = columnKey === "계약자주소";

  return (
    <input
      className={[
        "w-full h-[26px] px-2 py-0.5 outline-none bg-transparent",
        "text-[12px] font-normal text-slate-500",
        isAddress ? "text-left" : "text-center",
      ].join(" ")}
      value={value}
      onFocus={onFocus}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}