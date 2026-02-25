// scripts/sms-send.mjs
//
// 운영 서버에서 "09시 자동발송"을 트리거하기 위한 스크립트
//
// 사용 예)
//   node scripts/sms-send.mjs
//   BASE_DATE=2026-02-25 node scripts/sms-send.mjs
//   SUB_CATEGORY=대여첫안내 node scripts/sms-send.mjs
//
// ⚠️ 이 스크립트는 "현재 서버(자기 자신)"의 /api/sms/send 를 호출한다.
// - SERVER_ORIGIN 환경변수로 호출 대상 지정 가능(예: https://moulab.kr)
// - 기본값: http://127.0.0.1:3000

const origin = process.env.SERVER_ORIGIN || "http://127.0.0.1:3000";
const baseDateEnv = (process.env.BASE_DATE || "").trim();
const subEnv = (process.env.SUB_CATEGORY || "").trim();

const ALL_SUBS = ["대여첫안내", "만기3일전", "만기지남"];

function getKstTodayYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function postJson(url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text().catch(() => "");
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { res, json, text };
}

async function main() {
  const baseDate = baseDateEnv || getKstTodayYmd();
  const subs = subEnv ? [subEnv] : ALL_SUBS;

  const url = new URL("/api/sms/send", origin);

  let anyFail = false;

  for (const subCategory of subs) {
    const payload = { baseDate, subCategory };
    const { res, json, text } = await postJson(url, payload);

    if (!res.ok || json?.ok === false) {
      anyFail = true;
      console.error("send failed:", { subCategory, status: res.status, json: json ?? text });
      continue;
    }

    console.log("send ok:", { subCategory, result: json ?? text });
  }

  if (anyFail) process.exit(1);
}

main().catch((e) => {
  console.error("sms-send script error:", e);
  process.exit(1);
});