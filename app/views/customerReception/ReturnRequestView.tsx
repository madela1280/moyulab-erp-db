"use client";

export default function ReturnRequestView() {
  return (
    <div className="w-full h-full flex flex-col bg-white p-3">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="text-base font-semibold text-slate-800">반납접수</div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-[6px] text-xs font-medium text-slate-700 shadow-sm"
            disabled
          >
            전송
          </button>

          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-[6px] text-xs font-medium text-slate-700 shadow-sm"
            disabled
          >
            삭제
          </button>

          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-[6px] text-xs font-medium text-slate-700 shadow-sm"
            disabled
          >
            리스트
          </button>

          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-[6px] text-xs font-medium text-slate-700 shadow-sm"
            disabled
          >
            열넓이
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 rounded border border-slate-300 bg-white overflow-auto">
        <div className="p-4 text-sm text-slate-500">
          고객접수 &gt; 반납접수 화면 준비중
        </div>
      </div>
    </div>
  );
}