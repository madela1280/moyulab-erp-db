"use client";

import { useMemo, useState } from "react";
import type { SmsResultSyncResponse, SmsSendResponse } from "@/sms/types/sms.types";
import type { SmsSubCategory, SmsTargetRow } from "@/sms/types/sms.types";

export default function SmsSendPanel(props: {
  subCategory: SmsSubCategory;
  baseDate: string;
  selectedRows: SmsTargetRow[];
  selectedCount: number;

  onSend: (opts: { scope: "all" | "selected"; dryRun: boolean }) => Promise<SmsSendResponse>;
  onSyncResult: () => Promise<SmsResultSyncResponse>;
  onClearSelection: () => void;
}) {
  const { selectedCount, selectedRows } = props;

  const [busy, setBusy] = useState(false);
  const [lastMsg, setLastMsg] = useState<string>("");

  const canSendSelected = selectedCount > 0;

  const sample = useMemo(() => {
    const r = selectedRows[0];
    if (!r) return null;

    return {
      거래처분류: (r as any)["거래처분류"] ?? "",
      상태: (r as any)["상태"] ?? "",
      안내분류: (r as any)["안내분류"] ?? "",
      기기번호: (r as any)["기기번호"] ?? "",
      제품: (r as any)["제품"] ?? "",
      수취인명: (r as any)["수취인명"] ?? "",
      연락처1: (r as any)["연락처1"] ?? "",
      연락처2: (r as any)["연락처2"] ?? "",
      종료일: (r as any)["종료일"] ?? "",
      만기표시: (r as any)["만기일_표시문자"] ?? "",
    };
  }, [selectedRows]);

  async function runSend(scope: "all" | "selected", dryRun: boolean) {
    setBusy(true);
    setLastMsg("");
    try {
      const res = await props.onSend({ scope, dryRun });
      setLastMsg(
        res.ok
          ? `요청 완료: requested=${res.requestedCount ?? 0}, failed=${res.failedCount ?? 0}`
          : `요청 실패: ${res.error ?? "unknown"}`
      );
      if (scope === "selected" && res.ok) props.onClearSelection();
    } catch (e: any) {
      setLastMsg(`오류: ${String(e?.message || e || "send_failed")}`);
    } finally {
      setBusy(false);
    }
  }

  async function runSync() {
    setBusy(true);
    setLastMsg("");
    try {
      const res = await props.onSyncResult();
      setLastMsg(`결과 확정: success=${res.success}, fail=${res.fail}, processing=${res.processing}`);
    } catch (e: any) {
      setLastMsg(`오류: ${String(e?.message || e || "sync_failed")}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-3 flex flex-col gap-3">
      <div className="text-sm font-semibold text-gray-800">검증</div>

      <div className="border rounded p-2 bg-gray-50">
        <div className="text-xs font-semibold text-gray-700 mb-1">미리보기(선택 1건)</div>
        {sample ? (
          <div className="text-[11px] text-gray-700 leading-5">
            거래처분류: <span className="font-semibold">{String(sample.거래처분류 || "-")}</span>
            <br />
            상태: <span className="font-semibold">{String(sample.상태 || "-")}</span>
            <br />
            안내분류: <span className="font-semibold">{String(sample.안내분류 || "-")}</span>
            <br />
            수취인명: <span className="font-semibold">{String(sample.수취인명 || "-")}</span>
            <br />
            연락처1: <span className="font-mono">{String(sample.연락처1 || "-")}</span>
            <br />
            종료일: <span className="font-mono">{String(sample.종료일 || "-")}</span>
            <br />
            만기표시: <span className="font-mono">{String(sample.만기표시 || "-")}</span>
          </div>
        ) : (
          <div className="text-[11px] text-gray-500">선택된 대상이 없습니다.</div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <button
          className="px-3 py-2 text-xs rounded border bg-white hover:bg-gray-50 disabled:opacity-50"
          onClick={() => runSend("all", true)}
          disabled={busy}
          title="실제 발송 없이 서버 검증만 수행(서버 구현 범위 내)"
        >
          전체 검증(dry-run)
        </button>

        <button
          className="px-3 py-2 text-xs rounded border bg-gray-900 text-white hover:bg-black disabled:opacity-50"
          onClick={() => runSend("all", false)}
          disabled={busy}
        >
          전체 자동발송
        </button>

        <button
          className="px-3 py-2 text-xs rounded border bg-white hover:bg-gray-50 disabled:opacity-50"
          onClick={() => runSend("selected", false)}
          disabled={busy || !canSendSelected}
          title={canSendSelected ? "" : "선택된 대상이 없습니다."}
        >
          선택({selectedCount}) 발송
        </button>

        <button
          className="px-3 py-2 text-xs rounded border bg-white hover:bg-gray-50 disabled:opacity-50"
          onClick={() => runSync()}
          disabled={busy}
        >
          결과 동기화(확정)
        </button>
      </div>

      {lastMsg ? (
        <div className="text-xs border rounded p-2 bg-white text-gray-700">{lastMsg}</div>
      ) : null}
    </div>
  );
}