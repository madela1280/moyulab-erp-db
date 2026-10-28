// scripts/market-sales/coupang-daily-fetch.mjs
//
// 매일 아침 7시 cron 전용 — 어제 쿠팡 매출(일반+로켓그로스)을 수집해서 이카운트 자동전송까지 하고,
// 로켓재고(오늘 시점)도 같이 갱신한다. 한모정은 API 키 발급 전까지는 CREDENTIALS_NOT_CONFIGURED로
// 조용히 건너뛴다(에러 아님 — 나중에 키 발급되면 자동으로 동작 시작).
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
const today = kstDateString(now);
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

async function main() {
  console.log(`[${new Date().toISOString()}] 시작 — 매출수집(어제=${yesterday}), 재고(오늘=${today})`);

  for (const channel of CHANNELS) {
    console.log(`\n--- ${channel} ---`);

    const sales = await post("/api/market-sales/coupang-fetch", { channel, date: yesterday });
    if (sales.ok) {
      console.log(`[일반매출] ${JSON.stringify(sales.json)}`);
    } else if (sales.json?.error === "CREDENTIALS_NOT_CONFIGURED") {
      console.log(`[일반매출] 키 미설정 — 건너뜀`);
    } else {
      console.error(`[일반매출] 실패: ${JSON.stringify(sales.json)}`);
    }

    const rocket = await post("/api/market-sales/coupang-rocket-fetch", { channel, date: yesterday });
    if (rocket.ok) {
      console.log(`[로켓그로스매출] ${JSON.stringify(rocket.json)}`);
    } else if (rocket.json?.error === "CREDENTIALS_NOT_CONFIGURED") {
      console.log(`[로켓그로스매출] 키 미설정 — 건너뜀`);
    } else {
      console.error(`[로켓그로스매출] 실패: ${JSON.stringify(rocket.json)}`);
    }

    if (channel === "coupang_jcompany") {
      const stock = await post("/api/market-sales/coupang-rocket-stock", { channel, date: today });
      if (stock.ok) {
        console.log(`[로켓재고] ${JSON.stringify(stock.json)}`);
      } else if (stock.json?.error === "CREDENTIALS_NOT_CONFIGURED") {
        console.log(`[로켓재고] 키 미설정 — 건너뜀`);
      } else {
        console.error(`[로켓재고] 실패: ${JSON.stringify(stock.json)}`);
      }
    }
  }

  console.log(`\n[${new Date().toISOString()}] 완료`);
}

main().catch((err) => {
  console.error("[중단] 예외 발생:", err);
  process.exit(1);
});
