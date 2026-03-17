// app/views/aggregate/AggregateView.tsx
"use client";

import { useMemo } from "react";
import { useAggregateRunForm } from "@/aggregate/run/useAggregateRunForm";
import type {
  AggregateGranularity,
  ExtendScope,
  PartnerScope,
  PumpScope,
  RentTypeScope,
} from "@/aggregate/run/types.aggregateRun";

function FieldLabel(props: { required?: boolean; children: string }) {
  const { required, children } = props;
  return (
    <div className={`px-3 py-2 text-sm font-semibold border-r bg-gray-50 ${required ? "text-red-600" : "text-gray-800"}`}>
      {children}
    </div>
  );
}

function Row(props: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[180px_1fr] border-b last:border-b-0">
      {props.label}
      <div className="px-3 py-2">{props.children}</div>
    </div>
  );
}

function ErrorText(props: { text?: string | null }) {
  if (!props.text) return null;
  return <div className="mt-1 text-xs text-red-600">{props.text}</div>;
}

export default function AggregateView() {
  const form = useAggregateRunForm({
    compare: { 선택안함: true, 전년동일기간: false, 전월동일기간: false, 전주동일기간: false },
    partnerScope: "전체",
    pumpScope: "전체",
    extendScope: "전체",
    rentTypeScope: "전체",
  });

  const granularityOptions: AggregateGranularity[] = ["일별", "월별", "연별"];
  const partnerOptions: PartnerScope[] = ["전체", "보건소", "조리원", "온라인", "개인"];
  const pumpOptions: PumpScope[] = ["전체", "기종", "기기번호"];
  const extendOptions: ExtendScope[] = useMemo(() => {
    const arr: ExtendScope[] = ["전체", "0차"];
    for (let i = 1; i <= 15; i++) arr.push(`${i}차` as ExtendScope);
    return arr;
  }, []);
  const rentTypeOptions: RentTypeScope[] = ["전체", "기기변경", "재대여", "서비스"];

  return (
    <div className="w-full h-full overflow-auto">
      <div className="px-4 py-3">
        <div className="border rounded bg-white overflow-hidden">
          <div className="px-4 py-3 border-b bg-white">
            <div className="text-sm font-semibold text-gray-800">집계</div>
            <div className="text-xs text-gray-500 mt-1">
              기준일자/집계조건/비교기간은 필수 선택입니다. (현재 단계: UI + 검증 + 확인 요약 표시)
            </div>
          </div>

          {/* 조건 폼 */}
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
              <div className="mt-1 text-[11px] text-gray-500">
                반납완료일 포함 규칙/가중수량 등은 추후 집계 실행 API 단계에서 반영됩니다.
              </div>
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
                      <span className={checked ? "font-semibold text-gray-900" : "text-gray-700"}>{g}</span>
                    </label>
                  );
                })}
              </div>
              <ErrorText text={form.lastErrors.granularity} />
              <div className="mt-1 text-[11px] text-gray-500">
                일별은 기간이 길면 화면 과부하가 발생할 수 있어 최대 31일로 제한됩니다.
              </div>
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
                <div className="text-[11px] text-gray-500">예: 전체/보건소/조리원/온라인/개인</div>
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
                <div className="text-[11px] text-gray-500">예: 전체/기종/기기번호</div>
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
                <div className="text-[11px] text-gray-500">예: 전체/0차/1차…15차</div>
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
                <div className="text-[11px] text-gray-500">예: 기기변경/재대여/서비스</div>
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
                  <span className={form.state.compare.선택안함 ? "font-semibold text-gray-900" : "text-gray-700"}>
                    선택안함
                  </span>
                </label>

                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.state.compare.전년동일기간}
                    onChange={() => form.toggleCompare("전년동일기간")}
                  />
                  <span className={form.state.compare.전년동일기간 ? "font-semibold text-gray-900" : "text-gray-700"}>
                    전년동일기간
                  </span>
                </label>

                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.state.compare.전월동일기간}
                    onChange={() => form.toggleCompare("전월동일기간")}
                  />
                  <span className={form.state.compare.전월동일기간 ? "font-semibold text-gray-900" : "text-gray-700"}>
                    전월동일기간
                  </span>
                </label>

                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.state.compare.전주동일기간}
                    onChange={() => form.toggleCompare("전주동일기간")}
                  />
                  <span className={form.state.compare.전주동일기간 ? "font-semibold text-gray-900" : "text-gray-700"}>
                    전주동일기간
                  </span>
                </label>
              </div>
              <ErrorText text={form.lastErrors.compare} />
            </Row>

            <Row label={<FieldLabel>검색</FieldLabel>}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-[980px]">
                <div>
                  <div className="text-xs text-gray-600 mb-1">거래처</div>
                  <input
                    value={form.state.searchPartner}
                    onChange={(e) => form.setSearchPartner(e.target.value)}
                    placeholder="예: 수원 (부분입력 가능)"
                    className="w-full border rounded px-2 py-1 text-sm bg-white"
                  />
                </div>

                <div>
                  <div className="text-xs text-gray-600 mb-1">유축기</div>
                  <input
                    value={form.state.searchPump}
                    onChange={(e) => form.setSearchPump(e.target.value)}
                    placeholder="예: 심포니 (부분입력 가능)"
                    className="w-full border rounded px-2 py-1 text-sm bg-white"
                  />
                </div>

                <div className="md:col-span-2">
                  <div className="text-xs text-gray-600 mb-1">기기번호</div>
                  <input
                    value={form.state.searchDeviceNo}
                    onChange={(e) => form.setSearchDeviceNo(e.target.value)}
                    placeholder="예: 112315/012 (부분입력 가능)"
                    className="w-full border rounded px-2 py-1 text-sm bg-white"
                  />
                </div>
              </div>

              <div className="mt-2 text-[11px] text-gray-500">
                자동완성/유사거래처 후보 리스트는 다음 단계에서 API로 붙입니다(현재는 입력값 보관).
              </div>
            </Row>

            <Row label={<FieldLabel>확인버튼</FieldLabel>}>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => form.confirm()}
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

                {!form.canConfirm ? (
                  <div className="text-xs text-gray-500">필수 항목을 채우면 확인이 가능합니다.</div>
                ) : null}
              </div>
            </Row>
          </div>
        </div>

        {/* 결과(요약) */}
        <div className="mt-4 border rounded bg-white overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50">
            <div className="text-sm font-semibold text-gray-800">결과(요약)</div>
            <div className="text-xs text-gray-500 mt-1">
              지금 단계에서는 집계 실행 대신 선택한 조건 요약만 표시합니다.
            </div>
          </div>

          <div className="px-4 py-3">
            {!form.lastConfirm ? (
              <div className="text-xs text-gray-500">아직 확인을 누르지 않았습니다.</div>
            ) : (
              <div className="text-sm text-gray-800 space-y-2">
                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <div className="text-xs text-gray-600">기준일자</div>
                  <div className="text-sm">{form.lastConfirm.summary.기준일자Text}</div>
                </div>

                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <div className="text-xs text-gray-600">집계조건</div>
                  <div className="text-sm">{form.lastConfirm.summary.집계조건Text}</div>
                </div>

                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <div className="text-xs text-gray-600">비교기간</div>
                  <div className="text-sm">{form.lastConfirm.summary.비교기간Text}</div>
                </div>

                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <div className="text-xs text-gray-600">필터</div>
                  <div className="text-sm">{form.lastConfirm.summary.필터Text}</div>
                </div>

                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <div className="text-xs text-gray-600">검색</div>
                  <div className="text-sm">{form.lastConfirm.summary.검색Text || "(없음)"}</div>
                </div>

                <div className="pt-2 text-[11px] text-gray-500">
                  다음 단계: 확인 시 /api/aggregate/run 호출 → 유축기 기준 매출 집계 테이블 출력으로 연결.
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="h-6" />
      </div>
    </div>
  );
}