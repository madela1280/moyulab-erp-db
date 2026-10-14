"use client";

// app/views/lotteShipment/ScanView.tsx
//
// PM84로 롯데택배 송장 바코드를 스캔하는 화면. PM84의 ScanSettings를 "키보드 입력(Wedge)" +
// Terminator(Enter)로 설정해두면, 스캔한 값이 입력창에 자동으로 찍히고 Enter까지 눌린다 —
// 그래서 이 화면은 입력창 자동 포커스 + Enter 감지만으로 동작하고, 네이티브 앱이 필요 없다.

import { useEffect, useRef, useState } from "react";
import { scanLotteShipment, fetchRecentLotteScans, type ScanResult, type RecentScanRow } from "@/views/lotteShipment/service";

// ✅ 2026-10-08: 통합관리 매칭 문구는 화면에서 숨김 — 출고(스캔) 시점엔 아직 통합관리에
//    데이터가 안 올라와 있는 경우가 많아서, "못 찾음" 문구가 오히려 혼란을 줌. 스캔일시 기록과
//    백그라운드 매칭 시도는 그대로 두고(나중에 통합관리 쪽에 데이터가 올라오면 롯데택배 목록의
//    "전송" 버튼으로 수동 처리), 화면에는 수하인 정보만 보여준다.

// ✅ 2026-10-14: "최근 로그" 표는 화면에서만 기억하던 걸 서버 데이터(최근 스캔 기록)로 바꿨다.
//    PM84 Chrome이 백그라운드 탭을 메모리 절약 목적으로 새로고침시켜버리는 경우가 있는데,
//    그때마다 화면에 쌓아둔 기록이 통째로 사라지는 문제가 있었다. 서버에서 다시 불러오면
//    새로고침이 돼도 기록(+ 기기번호)이 그대로 복구된다.
//    위쪽 카드의 기기번호도 원래는 따로 폴링했는데, 표 폴링이랑 따로 놀면서 표에는 떴는데
//    카드에는 안 뜨는 문제가 생겨서 — 표 데이터(recentScans)에서 그대로 가져다 쓰도록 단순화했다.

const RECENT_SCANS_REFRESH_MS = 3000;

export default function ScanView() {
  const [value, setValue] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [lastScanned, setLastScanned] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [recentScans, setRecentScans] = useState<RecentScanRow[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // ✅ "다시시작" 버튼으로 중간에 취소했을 때, 늦게 돌아온 이전 요청 결과가 화면에 반영되지
  //    않도록 막는 용도. 버튼을 누르거나 새 스캔을 시작할 때마다 증가시킨다.
  const requestIdRef = useRef(0);

  function loadRecentScans() {
    fetchRecentLotteScans()
      .then(setRecentScans)
      .catch(() => {
        // 조회 실패는 조용히 무시하고 다음 주기에 재시도
      });
  }

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    loadRecentScans(); // ✅ 화면이 (새로고침 포함) 열릴 때마다 서버에서 다시 불러온다
    const timer = setInterval(loadRecentScans, RECENT_SCANS_REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // ✅ Chrome은 탭이 안 보이는 동안(다른 앱 보는 동안) setInterval을 느리게 돌리거나 멈춘다.
    //    탭이 다시 보이는 순간 바로 한 번 더 불러와서, 화면 전환 후에도 금방 반영되게 한다.
    function onVisible() {
      if (document.visibilityState === "visible") loadRecentScans();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // ✅ 지금 화면에 보여주고 있는 송장의 기기번호 — 표(recentScans)에서 바로 찾아서 쓴다.
  const deviceNo = recentScans.find((row) => row.운송장번호 === lastScanned)?.기기번호 ?? "";

  async function handleSubmit() {
    const invoiceNo = value.trim();
    if (!invoiceNo || loading) return;

    const myRequestId = ++requestIdRef.current;

    setLoading(true);
    setError("");
    setValue("");
    setResult(null);
    setLastScanned(invoiceNo); // ✅ 조회 끝나기 전에 바로 보여줘서, 잘못 스캔한 걸 기다리지 않고 바로 알 수 있게 함

    try {
      const res = await scanLotteShipment(invoiceNo);
      if (requestIdRef.current !== myRequestId) return; // 다시시작으로 취소된 요청 -> 무시

      setResult(res);
      if (res.found) loadRecentScans(); // 표에 바로 반영(기기번호는 아직 없을 수 있음 -> 이후 3초 주기로 갱신)
    } catch (e: any) {
      if (requestIdRef.current !== myRequestId) return;
      setError(e?.message || "스캔 처리하지 못했습니다.");
      setResult(null);
    } finally {
      if (requestIdRef.current === myRequestId) {
        setLoading(false);
        inputRef.current?.focus();
      }
    }
  }

  function handleRestart() {
    requestIdRef.current += 1; // 진행 중이던 요청을 전부 무효화
    setLoading(false);
    setResult(null);
    setLastScanned("");
    setError("");
    setValue("");
    inputRef.current?.focus();
  }

  const cardColor = !result ? "bg-slate-100 border-slate-300" : !result.found ? "bg-red-50 border-red-300" : "bg-emerald-50 border-emerald-300";

  return (
    <div className="w-full h-full flex flex-col p-4 gap-4 bg-white">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold text-slate-800">롯데택배 스캔</div>
        <button
          type="button"
          onClick={handleRestart}
          className="text-sm px-3 py-1.5 rounded-md border border-red-600 bg-red-600 text-white active:bg-red-700"
        >
          다시시작
        </button>
      </div>

      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit();
        }}
        onBlur={() => {
          // PM84 스캐너 사용 중 포커스가 빠지면 다시 잡아준다(다음 스캔이 바로 되도록).
          // 단, "다시시작" 버튼 등 다른 요소로 포커스가 옮겨간 거면 그 클릭을 방해하지 않도록
          // 완전히 포커스가 빠져나간 경우(activeElement가 body)에만 되돌린다.
          setTimeout(() => {
            if (!document.activeElement || document.activeElement === document.body) {
              inputRef.current?.focus();
            }
          }, 100);
        }}
        placeholder="여기에 송장번호를 스캔하세요"
        className="w-full text-2xl px-4 py-4 border-2 border-slate-400 rounded-lg text-center"
        autoFocus
      />

      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className={`rounded-lg border-2 p-4 min-h-[120px] flex flex-col justify-center ${cardColor}`}>
        {loading ? (
          <div className="text-slate-500 text-center">
            조회중... <span className="font-mono">{lastScanned}</span>
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
            <div className="text-sm font-semibold mt-2">
              {deviceNo ? <span className="text-blue-700">기기번호: {deviceNo}</span> : <span className="text-slate-400">기기번호 대기중...</span>}
            </div>
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
              <th className="px-2 py-1 text-left">수하인명</th>
              <th className="px-2 py-1 text-left">기기번호</th>
            </tr>
          </thead>
          <tbody>
            {recentScans.map((row) => (
              <tr key={row.운송장번호}>
                <td className="px-2 py-1 whitespace-nowrap">
                  {row.스캔일시 ? new Date(row.스캔일시).toLocaleTimeString("ko-KR") : ""}
                </td>
                <td className="px-2 py-1 whitespace-nowrap">{row.운송장번호}</td>
                <td className="px-2 py-1">{row.수하인명}</td>
                <td className="px-2 py-1">{row.기기번호 || <span className="text-slate-400">-</span>}</td>
              </tr>
            ))}
            {recentScans.length === 0 && (
              <tr>
                <td colSpan={4} className="px-2 py-4 text-center text-slate-400">
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
