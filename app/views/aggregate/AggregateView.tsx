// app/views/aggregate/AggregateView.tsx
"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useAggregateRunForm } from "@/aggregate/run/useAggregateRunForm";
import type {
  AggregateGranularity,
  ExtendScope,
  PartnerScope,
  PumpScope,
  RentTypeScope,
  AggregateRunRequest,
} from "@/aggregate/run/types.aggregateRun";
import AggregateResultView from "@/views/aggregate/AggregateResultView";

function FieldLabel(props: { required?: boolean; children: string }) {
  const { children } = props;
  return (
    <div className="px-3 py-2 text-sm font-semibold border-r bg-gray-50 text-gray-900">
      {children}
    </div>
  );
}

function Row(props: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[180px_1fr] border-b last:border-b-0">
      {props.label}
      <div className="px-3 py-2">{props.children}</div>
    </div>
  );
}

function ErrorText(props: { text?: string | null }) {
  if (!props.text) return null;
  return <div className="mt-1 text-xs text-gray-900">{props.text}</div>;
}

export default function AggregateView() {
  const form = useAggregateRunForm({
    compare: {
      선택안함: true,
      전년동일기간: false,
      전월동일기간: false,
    },
    partnerScope: "전체",
    pumpScope: "전체",
    extendScope: "전체",
    rentTypeScope: "전체",
  });

  const [resultRequest, setResultRequest] = useState<AggregateRunRequest | null>(null);

  const granularityOptions: AggregateGranularity[] = ["일별", "월별", "연별"];
  const partnerOptions: PartnerScope[] = ["전체", "보건소", "조리원", "온라인", "개인"];
  const pumpOptions: PumpScope[] = ["전체", "기종", "기기번호"];
  const extendOptions: ExtendScope[] = useMemo(() => {
    const arr: ExtendScope[] = ["전체", "0차"];
    for (let i = 1; i <= 15; i++) arr.push(`${i}차` as ExtendScope);
    return arr;
  }, []);
  const rentTypeOptions: RentTypeScope[] = ["전체", "기기변경", "재대여", "서비스", "대체기기", "문제기기"];

  const onConfirm = () => {
    const r = form.confirm();
    if (r.ok) {
      setResultRequest(r.request);
    }
  };

  if (resultRequest) {
    return <AggregateResultView request={resultRequest} onBack={() => setResultRequest(null)} />;
  }

  return (
    <div className="w-full h-full overflow-auto">
      <div className="px-4 py-3">
        {/* ✅ 가로폭 절반(큰 화면에서만) */}
        <div className="w-full lg:w-1/2">
          <div className="border rounded bg-white overflow-hidden">
            <div className="divide-y">
              <Row label={<FieldLabel required>기준일자</FieldLabel>}>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    value={form.state.periodStart}
                    onChange={(e) => form.setPeriodStart(e.target.value)}
                    className="border rounded px-2 py-1 text-sm bg-white"
                  />
                  <span className="text-sm text-gray-600">~</span>
                  <input
                    type="date"
                    value={form.state.periodEnd}
                    onChange={(e) => form.setPeriodEnd(e.target.value)}
                    className="border rounded px-2 py-1 text-sm bg-white"
                  />
                </div>

                <ErrorText text={form.lastErrors.periodStart} />
                <ErrorText text={form.lastErrors.periodEnd} />
                <ErrorText text={form.lastErrors.periodRange} />
                <ErrorText text={form.lastErrors.dailyRangeTooLong} />
              </Row>

              <Row label={<FieldLabel required>집계조건</FieldLabel>}>
                <div className="flex flex-wrap items-center gap-4">
                  {granularityOptions.map((g) => {
                    const checked = form.state.granularity === g;
                    return (
                      <label key={g} className="inline-flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="aggregate-granularity"
                          checked={checked}
                          onChange={() => form.setGranularity(g)}
                        />
                        <span className={checked ? "font-semibold text-gray-900" : "text-gray-700"}>
                          {g}
                        </span>
                      </label>
                    );
                  })}
                </div>

                <ErrorText text={form.lastErrors.granularity} />
              </Row>

              <Row label={<FieldLabel>거래처</FieldLabel>}>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={form.state.partnerScope}
                    onChange={(e) => form.setPartnerScope(e.target.value as PartnerScope)}
                    className="border rounded px-2 py-1 text-sm bg-white"
                  >
                    {partnerOptions.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                </div>
              </Row>

              <Row label={<FieldLabel>유축기</FieldLabel>}>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={form.state.pumpScope}
                    onChange={(e) => form.setPumpScope(e.target.value as PumpScope)}
                    className="border rounded px-2 py-1 text-sm bg-white"
                  >
                    {pumpOptions.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                </div>
              </Row>

              <Row label={<FieldLabel>연장</FieldLabel>}>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={form.state.extendScope}
                    onChange={(e) => form.setExtendScope(e.target.value as ExtendScope)}
                    className="border rounded px-2 py-1 text-sm bg-white"
                  >
                    {extendOptions.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                </div>
              </Row>

              <Row label={<FieldLabel>대여형태</FieldLabel>}>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={form.state.rentTypeScope}
                    onChange={(e) => form.setRentTypeScope(e.target.value as RentTypeScope)}
                    className="border rounded px-2 py-1 text-sm bg-white"
                  >
                    {rentTypeOptions.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                </div>
              </Row>

              <Row label={<FieldLabel required>비교기간</FieldLabel>}>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.state.compare.선택안함}
                      onChange={() => form.toggleCompare("선택안함")}
                    />
                    <span
                      className={
                        form.state.compare.선택안함 ? "font-semibold text-gray-900" : "text-gray-700"
                      }
                    >
                      선택안함
                    </span>
                  </label>

                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.state.compare.전년동일기간}
                      onChange={() => form.toggleCompare("전년동일기간")}
                    />
                    <span
                      className={
                        form.state.compare.전년동일기간 ? "font-semibold text-gray-900" : "text-gray-700"
                      }
                    >
                      전년동일기간
                    </span>
                  </label>

                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.state.compare.전월동일기간}
                      onChange={() => form.toggleCompare("전월동일기간")}
                    />
                    <span
                      className={
                        form.state.compare.전월동일기간 ? "font-semibold text-gray-900" : "text-gray-700"
                      }
                    >
                      전월동일기간
                    </span>
                  </label>     
                </div>

                <ErrorText text={form.lastErrors.compare} />
              </Row>

              {/* ✅ 검색: 세로로 통일(거래처 → 유축기 → 기기번호) */}
              <Row label={<FieldLabel>검색</FieldLabel>}>
                <div className="max-w-[520px] space-y-3">
                  <div>
                    <div className="text-xs text-gray-700 mb-1">거래처</div>
                    <input
                      value={form.state.searchPartner}
                      onChange={(e) => form.setSearchPartner(e.target.value)}
                      placeholder="예: 수원"
                      className="w-full border rounded px-2 py-1 text-sm bg-white"
                    />
                  </div>

                  <div>
                    <div className="text-xs text-gray-700 mb-1">유축기</div>
                    <input
                      value={form.state.searchPump}
                      onChange={(e) => form.setSearchPump(e.target.value)}
                      placeholder="예: 심포니"
                      className="w-full border rounded px-2 py-1 text-sm bg-white"
                    />
                  </div>

                  <div>
                    <div className="text-xs text-gray-700 mb-1">기기번호</div>
                    <input
                      value={form.state.searchDeviceNo}
                      onChange={(e) => form.setSearchDeviceNo(e.target.value)}
                      placeholder="예: 112315/012"
                      className="w-full border rounded px-2 py-1 text-sm bg-white"
                    />
                  </div>
                </div>
              </Row>

              <Row label={<FieldLabel>확인버튼</FieldLabel>}>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onConfirm}
                    className={`px-4 py-2 text-sm rounded border bg-blue-600 text-white border-blue-600 hover:bg-blue-700 ${
                      !form.canConfirm ? "opacity-60" : ""
                    }`}
                  >
                    확인
                  </button>

                  <button
                    type="button"
                    onClick={() => form.reset()}
                    className="px-4 py-2 text-sm rounded border bg-white hover:bg-gray-50"
                  >
                    초기화
                  </button>
                </div>
              </Row>
            </div>
          </div>

          <div className="h-6" />
        </div>
      </div>
    </div>
  );
}