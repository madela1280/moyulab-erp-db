// app/views/sms/components/SmsSubCategoryTabs.tsx
"use client";

import type { SmsSubCategory } from "@/sms/types/sms.types";

const TABS: { key: SmsSubCategory; label: string }[] = [
  { key: "대여첫안내", label: "대여첫안내" },
  { key: "만기3일전", label: "만기3일전" },
  { key: "만기지남", label: "만기지남" },
];

export default function SmsSubCategoryTabs(props: {
  value: SmsSubCategory;
  onChange: (next: SmsSubCategory) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {TABS.map((t) => {
        const active = props.value === t.key;
        return (
          <button
            key={t.key}
            className={
              "px-3 py-1.5 text-xs rounded-full border " +
              (active
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50")
            }
            onClick={() => props.onChange(t.key)}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}