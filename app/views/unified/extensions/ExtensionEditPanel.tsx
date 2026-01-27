"use client";

import { useEffect, useMemo, useState } from "react";
import { parseExtensionCell, formatExtensionCell, type ExtensionCellFields } from "@/views/unified/extensions/extensionFormat";

function normalizeName(v: any) {
  return String(v ?? "").trim();
}

function clampIntString(v: string, min: number, max: number) {
  const n = Number(String(v ?? "").trim());
  if (!Number.isFinite(n)) return "";
  const i = Math.floor(n);
  return String(Math.max(min, Math.min(max, i)));
}

function clampMoneyString(v: string) {
  const n = Number(String(v ?? "").trim());
  if (!Number.isFinite(n)) return "";
  const i = Math.floor(Math.max(0, n));
  return String(i);
}

/**
 * 1~5차연장 공용 입력 패널
 * - 셀에는 "연장일수/결제수단/금액/접수일" 문자열 형태로 저장/표시
 *   예) 30/계좌이체/20000/26.01.02
 */
export default function ExtensionEditPanel(props: {
  open: boolean;
  title?: string;

  /** 현재 셀 문자열(없으면 "") */
  initialValue: string;

  /** 결제수단 옵션(추후 별도 관리 기능 붙이기 전까지는 고정 배열로 전달 가능) */
  paymentOptions: string[];

  /** 패널 위치(선택) */
  x?: number;
  y?: number;

  /** 저장(클릭한 차수 컬럼에 셀 문자열 저장 + 종료일 자동반영은 상위에서 처리) */
  onSave: (nextCellText: string, fields: ExtensionCellFields) => Promise<void> | void;

  onClose: () => void;
}) {
  const { open, title, initialValue, paymentOptions, onClose, onSave } = props;

  const posStyle = useMemo(() => {
    if (Number.isFinite(props.x) && Number.isFinite(props.y)) {
      return { left: props.x as number, top: props.y as number };
    }
    // 기본: 화면 중앙 근처
    return { left: "50%", top: "22%", transform: "translateX(-50%)" as const };
  }, [props.x, props.y]);

  const [days, setDays] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [receivedDate, setReceivedDate] = useState<string>(""); // YYYY-MM-DD
  const [customPay, setCustomPay] = useState<string>("");

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;

    const parsed = parseExtensionCell(initialValue);
    setDays(parsed.days ?? "");
    setPaymentMethod(parsed.paymentMethod ?? "");
    setAmount(parsed.amount ?? "");
    setReceivedDate(parsed.receivedDate ?? "");
    setCustomPay("");
  }, [open, initialValue]);

  const canSave = useMemo(() => {
    if (!open) return false;
    // 입력이 아무것도 없으면 "지우기" 저장도 가능하게(true)
    return true;
  }, [open]);

  async function handleSave() {
    if (!canSave || saving) return;

    const normalizedDays = clampIntString(days, 0, 3650);
    const normalizedAmount = clampMoneyString(amount);

    const pay =
      paymentMethod === "__CUSTOM__"
        ? normalizeName(customPay)
        : normalizeName(paymentMethod);

    const fields: ExtensionCellFields = {
      days: normalizedDays || null,
      paymentMethod: pay || null,
      amount: normalizedAmount || null,
      receivedDate: normalizeName(receivedDate) || null, // YYYY-MM-DD
    };

    const nextText = formatExtensionCell(fields);

    setSaving(true);
    try {
      await onSave(nextText, fields);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <>
      {/* backdrop */}
      <div
        className="fixed inset-0 z-[80]"
        onMouseDown={() => onClose()}
        style={{ background: "rgba(0,0,0,0.15)" }}
      />

      {/* panel */}
      <div
        className="fixed z-[81] bg-white border shadow-lg"
        style={{
          ...posStyle,
          width: 340,
          borderRadius: 8,
        }}
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-2 border-b bg-slate-50 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-700">
            {title ?? "연장 입력"}
          </div>
          <button
            type="button"
            className="text-xs px-2 py-1 border rounded bg-white hover:bg-slate-100"
            onClick={onClose}
          >
            닫기
          </button>
        </div>

        <div className="p-3">
          <div className="grid grid-cols-[90px_1fr] gap-x-2 gap-y-2 text-xs">
            <div className="text-slate-600 flex items-center">연장일수</div>
            <input
              className="w-full px-2 py-1.5 border rounded"
              inputMode="numeric"
              placeholder="예: 30"
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />

            <div className="text-slate-600 flex items-center">결제수단</div>
            <div className="flex flex-col gap-2">
              <select
                className="w-full px-2 py-1.5 border rounded bg-white"
                value={paymentMethod || ""}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option value="">(비어있음)</option>
                {paymentOptions.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
                <option value="__CUSTOM__">직접입력…</option>
              </select>

              {paymentMethod === "__CUSTOM__" && (
                <input
                  className="w-full px-2 py-1.5 border rounded"
                  placeholder="결제수단 직접입력"
                  value={customPay}
                  onChange={(e) => setCustomPay(e.target.value)}
                />
              )}
            </div>

            <div className="text-slate-600 flex items-center">금액</div>
            <input
              className="w-full px-2 py-1.5 border rounded"
              inputMode="numeric"
              placeholder="예: 20000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />

            <div className="text-slate-600 flex items-center">접수일</div>
            <input
              className="w-full px-2 py-1.5 border rounded"
              type="date"
              value={receivedDate}
              onChange={(e) => setReceivedDate(e.target.value)}
            />
          </div>

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              className="text-xs px-3 py-2 border rounded bg-white hover:bg-slate-50"
              onClick={onClose}
              disabled={saving}
            >
              취소
            </button>
            <button
              type="button"
              className="text-xs px-3 py-2 border rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              onClick={handleSave}
              disabled={!canSave || saving}
              title='저장 시 셀에는 "연장일수/결제수단/금액/접수일" 형태로 표시됩니다.'
            >
              저장
            </button>
          </div>

          <div className="mt-2 text-[11px] text-slate-500">
            저장 예: <span className="font-mono">30/계좌이체/20000/26.01.02</span>
          </div>
        </div>
      </div>
    </>
  );
}