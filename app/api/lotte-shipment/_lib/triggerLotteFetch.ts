// app/api/lotte-shipment/_lib/triggerLotteFetch.ts
//
// 스캔했는데 롯데택배 데이터에 없을 때, 그 자리에서 RPA 스크립트를 1회 실행해 즉시 가져온다.
// --from 없이 호출하면 index.mjs가 알아서 "마지막으로 가져온 날짜 ~ 오늘"을 가져온다(하나만이
// 아니라 그 이후 전체를 가져옴 — 다음 스캔부터는 이미 수집돼 있어 대부분 바로 조회됨).
//
// ⚠️ 동시에 여러 번 호출돼도 RPA가 중복 실행되지 않도록, 진행 중인 호출이 있으면 그 결과를 같이
//    기다린다(스캐너가 1대뿐이라 실무상 거의 발생하지 않지만, 안전장치로 둔다).

import { execFile } from "child_process";

export type TriggerFetchResult = { ok: boolean; error?: string };

let inFlight: Promise<TriggerFetchResult> | null = null;

export async function triggerLotteFetchOnce(): Promise<TriggerFetchResult> {
  if (inFlight) return inFlight;

  inFlight = new Promise<TriggerFetchResult>((resolve) => {
    execFile(
      "xvfb-run",
      ["-a", "node", "scripts/lotte-alps-rpa/index.mjs"],
      {
        cwd: process.cwd(),
        timeout: 90_000, // 90초 넘으면 포기 — 스캔 화면이 무한정 기다리지 않도록
        env: process.env,
      },
      (error, stdout, stderr) => {
        if (error) {
          console.error("롯데 RPA 즉시 호출 실패:", error.message, stderr?.slice(-2000));
          resolve({ ok: false, error: error.message });
        } else {
          resolve({ ok: true });
        }
      }
    );
  });

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}
