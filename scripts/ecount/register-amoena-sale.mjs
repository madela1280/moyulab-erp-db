// scripts/ecount/register-amoena-sale.mjs
//
// 거래처 00043(아모에나/장루판매 합포장) 오늘자 매출을 수동 집계해서 이카운트 판매입력(SaveSale)에
// 1회 등록하는 테스트 스크립트. Zone -> Login -> SaveSale(테스트 URL) 전부 1회씩만 호출(재시도 없음).
//
// 실행 예:
// ECOUNT_COM_CODE=643956 ECOUNT_USER_ID=MEDELA ECOUNT_API_CERT_KEY=xxxx node scripts/ecount/register-amoena-sale.mjs

const COM_CODE = process.env.ECOUNT_COM_CODE;
const USER_ID = process.env.ECOUNT_USER_ID;
const API_CERT_KEY = process.env.ECOUNT_API_CERT_KEY;
const LAN_TYPE = process.env.ECOUNT_LAN_TYPE || "ko-KR";

const CUST = "00043"; // 아모에나/장루판매(합포장)
const WH_CD = "100"; // 본사창고

// ✅ 2026-10-22 사용자 제공 롯데 물품명 33건을 규칙대로 파싱 + 합산한 결과(교환/미발송/중복 건 제외).
const LINE_ITEMS = [
  { PROD_CD: "N0011", QTY: "21", PRICE: "40000" }, // 2602
  { PROD_CD: "N0007", QTY: "8", PRICE: "468000" }, // 342
  { PROD_CD: "N0002", QTY: "11", PRICE: "330000" }, // 367
  { PROD_CD: "N0009", QTY: "3", PRICE: "468000" }, // 392
  { PROD_CD: "N0020", QTY: "2", PRICE: "95000" }, // 568PB (모나 아이보리)
  { PROD_CD: "N0021", QTY: "2", PRICE: "95000" }, // 591BK (모나 블랙)
  { PROD_CD: "N0030", QTY: "1", PRICE: "33000" }, // 써지브라(N-S)
  { PROD_CD: "N0031", QTY: "2", PRICE: "33000" }, // 써지브라(N-M)
];

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
  const res = await fetch("https://oapi.ecount.com/OAPI/V2/Zone", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ COM_CODE }),
  });
  return res.json();
}

async function callLogin(zone) {
  const res = await fetch(`https://oapi${zone}.ecount.com/OAPI/V2/OAPILogin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ COM_CODE, USER_ID, API_CERT_KEY, LAN_TYPE, ZONE: zone }),
  });
  return res.json();
}

async function callSaveSale(zone, sessionId) {
  const url = `https://oapi${zone}.ecount.com/OAPI/V2/Sale/SaveSale?SESSION_ID=${encodeURIComponent(sessionId)}`;
  const ioDate = todayYYYYMMDD();

  const SaleList = LINE_ITEMS.map((item, idx) => {
    // ✅ 이카운트는 API 업로드 시 공급가액/부가세를 자동 계산해주지 않는다 — 직접 계산해서 같이 보내야 함.
    //    전부 부가세 과세대상(10%)으로 확인됨(2026-10-22 사용자 확인).
    const supplyAmt = Number(item.QTY) * Number(item.PRICE);
    const vatAmt = Math.round(supplyAmt * 0.1);
    return {
      BulkDatas: {
        UPLOAD_SER_NO: String(idx + 1),
        IO_DATE: ioDate,
        CUST,
        WH_CD,
        PROD_CD: item.PROD_CD,
        QTY: item.QTY,
        PRICE: item.PRICE,
        SUPPLY_AMT: String(supplyAmt),
        VAT_AMT: String(vatAmt),
      },
    };
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ SaleList }),
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

  console.log(`3) SaveSale API 호출... (품목 ${LINE_ITEMS.length}건, 거래처=${CUST})`);
  const saleResult = await callSaveSale(zone, sessionId);
  console.log(JSON.stringify(saleResult, null, 2));

  const data = saleResult.Data;
  if (String(saleResult.Status) !== "200" || !data || Number(data.FailCnt) > 0) {
    console.error("\n[실패] SaveSale 호출이 일부/전부 실패했습니다. 재시도하지 않습니다. 위 응답 내용을 확인하세요.");
    process.exit(1);
  }

  console.log("\n[완료] 아모에나 매출 등록 성공.");
  console.log(`   -> 전표번호(SlipNos): ${JSON.stringify(data.SlipNos)}`);
}

main().catch((err) => {
  console.error("[중단] 예외 발생. 재시도하지 않습니다.");
  console.error(err);
  process.exit(1);
});
