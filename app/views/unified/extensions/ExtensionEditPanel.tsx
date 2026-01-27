"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  parseExtensionCell,
  formatExtensionCell,
  type ExtensionCellFields,
} from "@/views/unified/extensions/extensionFormat";

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

function clampToViewport(x: number, y: number, w: number, h: number) {
  const margin = 12;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const maxX = Math.max(margin, vw - w - margin);
  const maxY = Math.max(margin, vh - h - margin);
  return {
    x: Math.min(maxX, Math.max(margin, x)),
    y: Math.min(maxY, Math.max(margin, y)),
  };
}

/**
 * 1~N차연장 공용 입력 패널
 * - 셀 저장 포맷: "연장일수/결제수단/금액/접수일"
 *   예) 30/계좌이체/20000/26.01.02
 *
 * ✅ 포함 기능
 * - "삭제(비우기)" 버튼: 셀 문자열을 ""로 저장(종료일 롤백은 자동 처리하지 않음)
 * - 패널 드래그 이동: 상단 헤더 드래그
 */
export default function ExtensionEditPanel(props: {
  open: boolean;
  title?: string;

  initialValue: string;
  paymentOptions: string[];

  x?: number;
  y?: number;

  onSave: (nextCellText: string, fields: ExtensionCellFields) => Promise<void> | void;
  onClose: () => void;
}) {
  const { open, title, initialValue, paymentOptions, onClose, onSave } = props;

  const PANEL_W = 360;
  const PANEL_H = 320;

  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 200, y: 140 });
  const dragRef = useRef<{ dragging: boolean; sx: number; sy: number; bx: number; by: number } | null>(null);

  const [days, setDays] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [receivedDate, setReceivedDate] = useState<string>(""); // YYYY-MM-DD
  const [customPay, setCustomPay] = useState<string>("");

  const [saving, setSaving] = useState(false);

  // open될 때 초기 위치/값 세팅
  useEffect(() => {
    if (!open) return;

    const parsed = parseExtensionCell(initialValue);
    setDays(parsed.days ?? "");
    setPaymentMethod(parsed.paymentMethod ?? "");
    setAmount(parsed.amount ?? "");
    setReceivedDate(parsed.receivedDate ?? "");
    setCustomPay("");

    const baseX = Number.isFinite(props.x) ? (props.x as number) : 200;
    const baseY = Number.isFinite(props.y) ? (props.y as number) : 140;
    setPos(clampToViewport(baseX, baseY, PANEL_W, PANEL_H));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialValue]);

  // 드래그 이동
  useEffect(() => {
    function onMove(ev: MouseEvent) {
      const st = dragRef.current;
      if (!st?.dragging) return;
      const dx = ev.clientX - st.sx;
      const dy = ev.clientY - st.sy;
      setPos(clampToViewport(st.bx + dx, st.by + dy, PANEL_W, PANEL_H));
    }

    function onUp() {
      const st = dragRef.current;
      if (st) st.dragging = false;
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const canSave = useMemo(() => open && !saving, [open, saving]);

  async function handleSave() {
    if (!canSave) return;

    const normalizedDays = clampIntString(days, 0, 3650);
    const normalizedAmount = clampMoneyString(amount);

    const pay =
      paymentMethod === "__CUSTOM__" ? normalizeName(customPay) : normalizeName(paymentMethod);

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

  async function handleClear() {
    if (!canSave) return;

    // ✅ 비우기(삭제): 셀 문자열만 지움. (종료일 롤백은 자동으로 하지 않음)
    const fields: ExtensionCellFields = {
      days: null,
      paymentMethod: null,
      amount: null,
      receivedDate: null,
    };

    setSaving(true);
    try {
      await onSave("", fields);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[80]"
        onMouseDown={() => onClose()}
        style={{ background: "rgba(0,0,0,0.15)" }}
      />

      <div
        className="fixed z-[81] bg-white border shadow-lg"
        style={{
          left: pos.x,
          top: pos.y,
          width: PANEL_W,
          height: PANEL_H,
          borderRadius: 8,
        }}
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          className="px-3 py-2 border-b bg-slate-50 flex items-center justify-between select-none cursor-move"
          onMouseDown={(e) => {
            if (e.button !== 0) return;
            dragRef.current = { dragging: true, sx: e.clientX, sy: e.clientY, bx: pos.x, by: pos.y };
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <div className="text-sm font-semibold text-slate-700">{title ?? "연장 입력"}</div>
          <button
            type="button"
            className="text-xs px-2 py-1 border rounded bg-white hover:bg-slate-100"
            onClick={onClose}
            disabled={saving}
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

          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              type="button"
              className="text-xs px-3 py-2 border rounded bg-white hover:bg-slate-50"
              onClick={handleClear}
              disabled={!canSave}
              title="이 차수 연장 기록을 비웁니다(종료일은 자동 롤백하지 않음)"
            >
              삭제(비우기)
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="text-xs px-3 py-2 border rounded bg-white hover:bg-slate-50"
                onClick={onClose}
                disabled={!canSave}
              >
                취소
              </button>
              <button
                type="button"
                className="text-xs px-3 py-2 border rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                onClick={handleSave}
                disabled={!canSave}
              >
                저장
              </button>
            </div>
          </div>

          <div className="mt-2 text-[11px] text-slate-500">
            저장 예: <span className="font-mono">30/계좌이체/20000/26.01.02</span>
          </div>
        </div>
      </div>
    </>
  );
}