"use client";

import SymphonyMain from "@/devices/symphony/components/SymphonyMain";

export default function SymphonyView() {
  // 규칙: 레이아웃/여백 문제는 View 안에서만 wrapper로 처리
  return (
    <div className="w-full h-full flex flex-col">
      <SymphonyMain />
    </div>
  );
}
