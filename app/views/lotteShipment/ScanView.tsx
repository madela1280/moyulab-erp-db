"use client";

// app/views/lotteShipment/ScanView.tsx
//
// PM84로 롯데택배 송장 바코드를 스캔하는 화면. PM84의 ScanSettings를 "키보드 입력(Wedge)" +
// Terminator(Enter)로 설정해두면, 스캔한 값이 입력창에 자동으로 찍히고 Enter까지 눌린다 —
// 그래서 이 화면은 입력창 자동 포커스 + Enter 감지만으로 동작하고, 네이티브 앱이 필요 없다.

import { useEffect, useRef, useState } from "react";
import { scanLotteShipment, type ScanResult } from "@/views/lotteShipment/service";

type LogEntry = {
  invoiceNo: string;
  at: string;
  ok: boolean;
  message: string;
};

// ✅ 2026-10-08: 통합관리 매칭 문구는 화면에서 숨김 — 출고(스캔) 시점엔 아직 통합관리에
//    데이터가 안 올라와 있는 경우가 많아서, "못 찾음" 문구가 오히려 혼란을 줌. 스캔일시 기록과
//    백그라운드 매칭 시도는 그대로 두고(나중에 통합관리 쪽에 데이터가 올라오면 롯데택배 목록의
//    "전송" 버튼으로 수동 처리), 화면에는 수하인 정보만 보여준다.

export default function ScanView() {
  const [value, setValue] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [lastScanned, setLastScanned] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit() {
    const invoiceNo = value.trim();
    if (!invoiceNo || loading) return;

    setLoading(true);
    setError("");
    setValue("");

    try {
      const res = await scanLotteShipment(invoiceNo);
      setResult(res);
      setLastScanned(invoiceNo);

      const message = !res.found ? "송장을 찾을 수 없음(등록 안 된 송장)" : `${res.row?.수하인명 ?? ""} — 스캔 완료`;

      setLog((prev) => [{ invoiceNo, at: new Date().toLocaleTimeString("ko-KR"), ok: res.found, message }, ...prev].slice(0, 30));
    } catch (e: any) {
      setError(e?.message || "스캔 처리하지 못했습니다.");
      setResult(null);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  const cardColor = !result ? "bg-slate-100 border-slate-300" : !result.found ? "bg-red-50 border-red-300" : "bg-emerald-50 border-emerald-300";

  return (
    <div className="w-full h-full flex flex-col p-4 gap-4 bg-white">
      <div className="text-lg font-semibold text-slate-800">롯데택배 스캔</div>

      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit();
        }}
        onBlur={() => {
          // PM84 스캐너 사용 중 포커스가 빠지면 다시 잡아준다(다음 스캔이 바로 되도록)
          setTimeout(() => inputRef.current?.focus(), 100);
        }}
        placeholder="여기에 송장번호를 스캔하세요"
        className="w-full text-2xl px-4 py-4 border-2 border-slate-400 rounded-lg text-center"
        autoFocus
      />

      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className={`rounded-lg border-2 p-4 min-h-[120px] flex flex-col justify-center ${cardColor}`}>
        {loading ? (
          <div className="text-slate-500 text-center">
            조회중...
            <div className="text-xs font-normal mt-1">처음 보는 송장이면 최대 1~2분 걸릴 수 있습니다</div>
          </div>
        ) : !result ? (
          <div className="text-slate-400 text-center">스캔 대기중</div>
        ) : !result.found ? (
          <div className="text-red-700 text-center text-lg font-semibold">
            송장을 찾을 수 없습니다
            <div className="text-sm font-normal mt-1">{lastScanned}</div>
          </div>
        ) : (
          <div className="text-center">
            <div className="text-xl font-bold text-slate-800">{result.row?.수하인명}</div>
            <div className="text-sm text-slate-600 mt-1">{result.row?.수하인전화번호}</div>
            <div className="text-sm text-slate-600">{result.row?.수하인주소}</div>
            <div className="text-xs text-slate-400 mt-1">{lastScanned}</div>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-auto rounded border border-slate-200">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-100">
            <tr>
              <th className="px-2 py-1 text-left">시각</th>
              <th className="px-2 py-1 text-left">송장번호</th>
              <th className="px-2 py-1 text-left">결과</th>
            </tr>
          </thead>
          <tbody>
            {log.map((entry, i) => (
              <tr key={i} className={entry.ok ? "" : "bg-red-50"}>
                <td className="px-2 py-1 whitespace-nowrap">{entry.at}</td>
                <td className="px-2 py-1 whitespace-nowrap">{entry.invoiceNo}</td>
                <td className="px-2 py-1">{entry.message}</td>
              </tr>
            ))}
            {log.length === 0 && (
              <tr>
                <td colSpan={3} className="px-2 py-4 text-center text-slate-400">
                  아직 스캔 기록이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
