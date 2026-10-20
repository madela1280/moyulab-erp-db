// scripts/ecount/test-login.mjs
//
// 이카운트 Open API 연동 1회성 검증 스크립트.
// 테스트 인증키로 Zone -> Login API를 "딱 1번씩만" 호출한다.
// 이카운트 정책상 동일 IP에서 zone/login 실패가 10회 누적되면 IP가 차단되므로
// 재시도 로직을 절대 넣지 않는다 (실패 시 즉시 중단).
//
// 실행 예:
// ECOUNT_COM_CODE=643956 ECOUNT_USER_ID=MEDELA1 ECOUNT_API_CERT_KEY=xxxx node scripts/ecount/test-login.mjs

const COM_CODE = process.env.ECOUNT_COM_CODE;
const USER_ID = process.env.ECOUNT_USER_ID;
const API_CERT_KEY = process.env.ECOUNT_API_CERT_KEY;
const LAN_TYPE = process.env.ECOUNT_LAN_TYPE || "ko-KR";

if (!COM_CODE || !USER_ID || !API_CERT_KEY) {
  console.error("[중단] ECOUNT_COM_CODE / ECOUNT_USER_ID / ECOUNT_API_CERT_KEY 환경변수가 필요합니다.");
  process.exit(1);
}

async function callZone() {
  const res = await fetch("https://sboapi.ecount.com/OAPI/V2/Zone", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ COM_CODE }),
  });
  const json = await res.json();
  return json;
}

async function callLogin(zone) {
  const res = await fetch(`https://sboapi${zone}.ecount.com/OAPI/V2/OAPILogin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      COM_CODE,
      USER_ID,
      API_CERT_KEY,
      LAN_TYPE,
      ZONE: zone,
    }),
  });
  const json = await res.json();
  return json;
}

async function main() {
  console.log("1) Zone API 호출...");
  const zoneResult = await callZone();

  if (String(zoneResult.Status) !== "200" || !zoneResult.Data?.ZONE) {
    console.error("[중단] Zone API 실패. 재시도하지 않습니다.");
    console.error(JSON.stringify(zoneResult, null, 2));
    process.exit(1);
  }

  const zone = zoneResult.Data.ZONE;
  console.log(`   -> ZONE=${zone}, DOMAIN=${zoneResult.Data.DOMAIN}`);

  console.log("2) Login API 호출...");
  const loginResult = await callLogin(zone);

  if (String(loginResult.Status) !== "200" || !loginResult.Data?.Datas?.SESSION_ID) {
    console.error("[중단] Login API 실패. 재시도하지 않습니다.");
    console.error(JSON.stringify(loginResult, null, 2));
    process.exit(1);
  }

  const sessionId = loginResult.Data.Datas.SESSION_ID;
  console.log("   -> 로그인 성공");
  console.log(`   -> SESSION_ID(앞 10자리만 표시): ${sessionId.slice(0, 10)}...`);
  console.log("\n[완료] 이카운트가 이 요청을 자동 검증 처리합니다. API인증현황 화면에서 검증여부를 확인하세요.");
}

main().catch((err) => {
  console.error("[중단] 예외 발생. 재시도하지 않습니다.");
  console.error(err);
  process.exit(1);
});
