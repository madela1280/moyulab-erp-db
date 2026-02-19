// scripts/sms-aggregate.mjs
//
// 운영 서버에서 집계를 트리거하기 위한 스크립트
// - 05시: MODE=base
// - 19시: MODE=incremental
//
// 사용 예)
//   MODE=base node scripts/sms-aggregate.mjs
//   MODE=incremental node scripts/sms-aggregate.mjs
//   BASE_DATE=2026-02-19 MODE=incremental node scripts/sms-aggregate.mjs
//
// ⚠️ 이 스크립트는 "현재 서버(자기 자신)"의 /api/sms/aggregate 를 호출한다.
// - SERVER_ORIGIN 환경변수로 호출 대상 지정 가능(예: https://erp.example.com)
// - 기본값: http://127.0.0.1:3000  (같은 서버에서 next가 3000으로 떠있다는 전제)

const origin = process.env.SERVER_ORIGIN || "http://127.0.0.1:3000";
const baseDate = process.env.BASE_DATE || "";
const mode = (process.env.MODE || "base").trim();

async function main() {
  const url = new URL("/api/sms/aggregate", origin);

  const payload = {
    baseDate: baseDate || undefined,
    mode: mode || "base", // "base" | "incremental"
  };

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

  if (!res.ok) {
    console.error("aggregate failed:", res.status, json ?? text);
    process.exit(1);
  }

  console.log("aggregate ok:", json ?? text);
}

main().catch((e) => {
  console.error("aggregate script error:", e);
  process.exit(1);
});