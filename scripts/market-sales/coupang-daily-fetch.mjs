// scripts/market-sales/coupang-daily-fetch.mjs
//
// 매일 아침 7시 cron 전용 — 어제 쿠팡 매출(일반+로켓그로스)을 수집해서 이카운트 자동전송까지 한다.
// 2026-10-29부터 제이컴퍼니/한모정 둘 다 키 설정됨. (2026-11-09: 로켓재고 기능 삭제)
// 채널의 API 키가 아직 없으면 CREDENTIALS_NOT_CONFIGURED로 조용히 건너뛴다(에러 아님).
// ⚠️ 단계 하나가 실패해도(네트워크 오류 포함) 나머지 단계/채널은 계속 진행된다(safeCall로 격리).
// ⚠️ 마지막 "미전송재시도" 단계는 오늘 가져온 건뿐 아니라 과거에 전송만 실패하고 남아있던 건까지
//    전부 다시 전송을 시도한다 — 그래서 전송 실패가 하루 이틀 뒤에는 저절로 해소된다.
//
// crontab: 0 7 * * * cd /home/ubuntu/moyulab-erp-db && SERVER_ORIGIN=http://127.0.0.1:3000 \
//   node scripts/market-sales/coupang-daily-fetch.mjs >> logs/market-sales-fetch.log 2>&1

const SERVER_ORIGIN = process.env.SERVER_ORIGIN || "http://127.0.0.1:3000";
const CHANNELS = ["coupang_jcompany", "coupang_hanmojeong"];

function kstDateString(d) {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())}`;
}

const now = new Date();
const yesterday = kstDateString(new Date(now.getTime() - 24 * 60 * 60 * 1000));

async function post(path, body) {
  const res = await fetch(`${SERVER_ORIGIN}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

// ✅ 한 단계(호출)가 네트워크 오류 등으로 예외를 던져도 여기서 끝낸다 — 절대 위로 전파시키지 않는다.
//    그래야 이 호출 하나가 실패해도 나머지 채널/단계가 전부 건너뛰어지지 않고 계속 진행된다.
let anyFailure = false;
async function safeCall(label, path, body) {
  try {
    const result = await post(path, body);
    if (result.ok) {
      console.log(`[${label}] ${JSON.stringify(result.json)}`);
    } else if (result.json?.error === "CREDENTIALS_NOT_CONFIGURED") {
      console.log(`[${label}] 키 미설정 — 건너뜀`);
    } else {
      console.error(`[${label}] 실패: ${JSON.stringify(result.json)}`);
      anyFailure = true;
    }
  } catch (err) {
    console.error(`[${label}] 예외(호출 자체 실패, 다음 단계는 계속 진행): ${err?.message || err}`);
    anyFailure = true;
  }
}

async function main() {
  console.log(`[${new Date().toISOString()}] 시작 — 매출수집(어제=${yesterday})`);

  for (const channel of CHANNELS) {
    console.log(`\n--- ${channel} ---`);

    await safeCall("일반매출", "/api/market-sales/coupang-fetch", { channel, date: yesterday });
    await safeCall("로켓그로스매출", "/api/market-sales/coupang-rocket-fetch", { channel, date: yesterday });

    // ✅ 위 단계에서 이카운트 전송이 실패해 '미전송'으로 남은 과거 건까지 포함해서 매일 재시도한다
    //    (2026-11-02: 전송 실패 건이 다음날로 안 넘어가고 그냥 쌓이던 문제 때문에 추가됨).
    await safeCall("미전송재시도", "/api/market-sales/retry-pending", { channel });
  }

  console.log(`\n[${new Date().toISOString()}] 완료${anyFailure ? " (일부 실패 있음 — 위 로그 확인 필요)" : " (전부 정상)"}`);
}

main().catch((err) => {
  // ✅ 위에서 전부 safeCall로 감쌌기 때문에 여기까지 올라오는 건 진짜 예상 못 한 버그뿐이다.
  console.error("[중단] 예상 못 한 예외 발생:", err);
  process.exit(1);
});
