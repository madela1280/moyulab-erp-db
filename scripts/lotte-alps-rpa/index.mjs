// scripts/lotte-alps-rpa/index.mjs
//
// 실행 예시:
//   node scripts/lotte-alps-rpa/index.mjs
//   node scripts/lotte-alps-rpa/index.mjs --from 2026-09-01
//
// 필요 환경변수:
//   LOTTE_ALPS_USERNAME   — ALPS 로그인 아이디
//   LOTTE_ALPS_PASSWORD   — ALPS 로그인 비밀번호
//   LOTTE_ALPS_TOTP_SECRET — OTP 앱 등록 시 받은 Base32 비밀키(QR코드 안의 secret)
//   DATABASE_URL          — 기존 ERP와 동일한 접속 문자열
//   LOTTE_RPA_SOCKS_PROXY  — (서버에서 실행 시 필수) PC→서버 SSH 역방향 터널로 연 SOCKS 프록시 주소.
//                            예: socks5://127.0.0.1:1080
//                            (롯데가 18210 포트를 서버 IP는 막고 PC IP는 허용하는 것으로 확인되어 필요)
//
// ⚠️ 실행 전 필요:
//   1) npm install playwright && npx playwright install chromium  (직접 승인 후 실행)
//   2) scrape.mjs의 SELECTORS 값을 실제 화면 기준으로 교체
//   3) 위 4개 환경변수를 서버 .env 또는 PM2 ecosystem에 등록

import { scrapeAlpsWaybills } from "./scrape.mjs";
import { saveShipmentRows, getLastPulledDate } from "./save.mjs";

function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function parseArg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] : null;
}

async function main() {
  const username = process.env.LOTTE_ALPS_USERNAME;
  const password = process.env.LOTTE_ALPS_PASSWORD;
  const totpSecret = process.env.LOTTE_ALPS_TOTP_SECRET;

  if (!username || !password) {
    console.error("LOTTE_ALPS_USERNAME / LOTTE_ALPS_PASSWORD 환경변수가 필요합니다.");
    process.exit(1);
  }

  const toDate = todayStr();
  const fromDate = parseArg("from") || (await getLastPulledDate()) || toDate;

  console.log(`조회 범위: ${fromDate} ~ ${toDate}`);

  const rows = await scrapeAlpsWaybills({ username, password, totpSecret, fromDate, toDate });
  console.log(`스크랩 결과: ${rows.length}건(합포장 중복 제거 후)`);

  const { savedCount } = await saveShipmentRows(rows, { toDate });
  console.log(`저장 완료: ${savedCount}건`);
}

main().catch((err) => {
  console.error("실행 실패:", err);
  process.exit(1);
});
