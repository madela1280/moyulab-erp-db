// scripts/ecount/test-sale.mjs
//
// 이카운트 Open API 판매입력(SaveSale) 1회성 검증 스크립트.
// Zone -> Login -> SaveSale(테스트 URL)을 "딱 1번씩만" 호출한다.
// 실패해도 재시도하지 않는다 (이카운트 IP 차단 정책 + 중복 전표 생성 방지).
//
// 주의: 이 호출은 실제로 이카운트에 판매전표 1건을 생성한다. 테스트 후 전표번호를
// 확인해서 필요하면 이카운트 화면에서 직접 삭제해야 한다.
//
// 실행 예:
// ECOUNT_COM_CODE=643956 ECOUNT_USER_ID=MEDELA ECOUNT_API_CERT_KEY=xxxx node scripts/ecount/test-sale.mjs

const COM_CODE = process.env.ECOUNT_COM_CODE;
const USER_ID = process.env.ECOUNT_USER_ID;
const API_CERT_KEY = process.env.ECOUNT_API_CERT_KEY;
const LAN_TYPE = process.env.ECOUNT_LAN_TYPE || "ko-KR";

const CUST = process.env.ECOUNT_TEST_CUST || "00001";
const PROD_CD = process.env.ECOUNT_TEST_PROD_CD || "M0001";
const WH_CD = process.env.ECOUNT_TEST_WH_CD || "100";

if (!COM_CODE || !USER_ID || !API_CERT_KEY) {
  console.error("[중단] ECOUNT_COM_CODE / ECOUNT_USER_ID / ECOUNT_API_CERT_KEY 환경변수가 필요합니다.");
  process.exit(1);
}

function todayYYYYMMDD() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

async function callZone() {
  const res = await fetch("https://sboapi.ecount.com/OAPI/V2/Zone", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ COM_CODE }),
  });
  return res.json();
}

async function callLogin(zone) {
  const res = await fetch(`https://sboapi${zone}.ecount.com/OAPI/V2/OAPILogin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ COM_CODE, USER_ID, API_CERT_KEY, LAN_TYPE, ZONE: zone }),
  });
  return res.json();
}

async function callSaveSale(zone, sessionId) {
  const url = `https://sboapi${zone}.ecount.com/OAPI/V2/Sale/SaveSale?SESSION_ID=${encodeURIComponent(sessionId)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      SaleList: [
        {
          BulkDatas: {
            UPLOAD_SER_NO: "1",
            IO_DATE: todayYYYYMMDD(),
            CUST,
            WH_CD,
            PROD_CD,
            QTY: "1",
          },
        },
      ],
    }),
  });
  return res.json();
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
  console.log(`   -> ZONE=${zone}`);

  console.log("2) Login API 호출...");
  const loginResult = await callLogin(zone);
  if (String(loginResult.Status) !== "200" || !loginResult.Data?.Datas?.SESSION_ID) {
    console.error("[중단] Login API 실패. 재시도하지 않습니다.");
    console.error(JSON.stringify(loginResult, null, 2));
    process.exit(1);
  }
  const sessionId = loginResult.Data.Datas.SESSION_ID;
  console.log("   -> 로그인 성공");

  console.log(`3) SaveSale API 호출... (CUST=${CUST}, PROD_CD=${PROD_CD}, WH_CD=${WH_CD})`);
  const saleResult = await callSaveSale(zone, sessionId);
  console.log(JSON.stringify(saleResult, null, 2));

  const data = saleResult.Data;
  if (String(saleResult.Status) !== "200" || !data || data.FailCnt > 0) {
    console.error("\n[실패] SaveSale 호출이 실패했습니다. 재시도하지 않습니다. 위 응답 내용을 확인하세요.");
    process.exit(1);
  }

  console.log("\n[완료] 판매전표 생성 성공.");
  console.log(`   -> 전표번호(SlipNos): ${JSON.stringify(data.SlipNos)}`);
  console.log("   -> 테스트 전표이므로 필요하면 이카운트 화면에서 직접 삭제하세요.");
}

main().catch((err) => {
  console.error("[중단] 예외 발생. 재시도하지 않습니다.");
  console.error(err);
  process.exit(1);
});
