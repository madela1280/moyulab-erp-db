"use client";

export default function DateCell({
  value,
  onChange,
  onFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onFocus: () => void;
}) {
  // HTML date input은 클릭 시 달력 표시 + 직접 입력 가능
  // 값은 "YYYY-MM-DD" 형태 권장, 아니면 빈 칸으로 보일 수 있어 그대로 문자열 유지
  return (
    <input
      type="date"
      className="w-full h-[26px] px-2 py-0.5 outline-none bg-transparent text-[12px] font-normal text-slate-500 text-center"
      value={value}
      onFocus={onFocus}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}