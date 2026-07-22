"use client";

type Props = {
  enabled: boolean;
  onToggle: () => void;
};

export default function UnifiedMigrationModeButton({ enabled, onToggle }: Props) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={
        enabled
          ? "초기이관모드 ON: 붙여넣은 안내분류 원시값을 고정합니다"
          : "초기이관모드 OFF: 기존 자동매핑 규칙을 사용합니다"
      }
      className={[
        "inline-flex items-center gap-1.5 text-xs px-2 py-1 border rounded font-medium",
        enabled
          ? "bg-amber-200 border-amber-400 text-amber-950 hover:bg-amber-300 active:bg-amber-400"
          : "bg-slate-100 border-slate-200 text-slate-800 hover:bg-slate-200 active:bg-slate-300",
      ].join(" ")}
    >
      <span
        className={[
          "inline-block w-2 h-2 rounded-full",
          enabled ? "bg-red-500" : "bg-slate-400",
        ].join(" ")}
      />
      <span>{enabled ? "초기이관 ON" : "초기이관 OFF"}</span>
    </button>
  );
}