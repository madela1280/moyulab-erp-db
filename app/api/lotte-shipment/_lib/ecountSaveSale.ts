// app/api/lotte-shipment/_lib/ecountSaveSale.ts
//
// 이카운트 판매입력(SaveSale) 실서버 호출 공용 모듈.
// ⚠️ 로그인(Zone/Login) API는 실서버 기준 10분에 1회만 허용된다 — 세션을 캐싱해서 재사용하고,
//    저장 실패해도 절대 자동 재시도하지 않는다(이카운트 IP 차단 정책).

export type EcountSaleLine = {
  PROD_CD: string;
  QTY: number;
  PRICE: number;
};

export type EcountSaveSaleResult =
  | { ok: true; slipNos: string[] }
  | { ok: false; reason: string; raw?: any };

type Session = { zone: string; sessionId: string; cachedAt: number };

function getSessionCache(): { current: Session | null } {
  const g = globalThis as any;
  if (!g.__ecountSessionCache) g.__ecountSessionCache = { current: null };
  return g.__ecountSessionCache;
}

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function todayYYYYMMDD() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

async function callZone(comCode: string) {
  const res = await fetch("https://oapi.ecount.com/OAPI/V2/Zone", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ COM_CODE: comCode }),
  });
  return res.json();
}

async function callLogin(zone: string, comCode: string, userId: string, apiCertKey: string) {
  const res = await fetch(`https://oapi${zone}.ecount.com/OAPI/V2/OAPILogin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ COM_CODE: comCode, USER_ID: userId, API_CERT_KEY: apiCertKey, LAN_TYPE: "ko-KR", ZONE: zone }),
  });
  return res.json();
}

// ✅ 세션이 캐시에 있으면 그대로 재사용(로그인 10분/1회 제한 때문). 없을 때만 Zone->Login 1회 호출.
async function getOrCreateSession(): Promise<Session> {
  const cache = getSessionCache();
  if (cache.current) return cache.current;

  const comCode = mustEnv("ECOUNT_COM_CODE");
  const userId = mustEnv("ECOUNT_USER_ID");
  const apiCertKey = mustEnv("ECOUNT_API_CERT_KEY");

  const zoneResult = await callZone(comCode);
  if (String(zoneResult.Status) !== "200" || !zoneResult.Data?.ZONE) {
    throw new Error(`Zone API 실패: ${JSON.stringify(zoneResult)}`);
  }
  const zone = zoneResult.Data.ZONE as string;

  const loginResult = await callLogin(zone, comCode, userId, apiCertKey);
  if (String(loginResult.Status) !== "200" || !loginResult.Data?.Datas?.SESSION_ID) {
    throw new Error(`Login API 실패: ${JSON.stringify(loginResult)}`);
  }

  const session: Session = { zone, sessionId: loginResult.Data.Datas.SESSION_ID, cachedAt: Date.now() };
  cache.current = session;
  return session;
}

/**
 * CUST 1개 기준으로 여러 품목 라인을 한 전표(또는 묶음)로 등록한다.
 * ⚠️ 저장(쓰기) API라 호출하면 실제 전표가 생긴다. 실패해도 재시도하지 않는다.
 */
export async function registerEcountSale(args: {
  cust: string;
  whCd: string;
  lines: EcountSaleLine[];
  // ✅ YYYYMMDD. 안 주면 기존 그대로 오늘 날짜(롯데택배 스캔 전송 등 기존 호출부는 영향 없음).
  //    마켓매출(쿠팡 등)처럼 실제 판매일과 전송 시점이 다를 수 있는 경우에만 명시적으로 넘긴다.
  ioDate?: string;
}): Promise<EcountSaveSaleResult> {
  if (!args.lines.length) return { ok: false, reason: "NO_LINES" };

  let session: Session;
  try {
    session = await getOrCreateSession();
  } catch (err: any) {
    return { ok: false, reason: `SESSION_FAILED: ${err?.message || err}` };
  }

  const ioDate = args.ioDate || todayYYYYMMDD();
  const url = `https://oapi${session.zone}.ecount.com/OAPI/V2/Sale/SaveSale?SESSION_ID=${encodeURIComponent(session.sessionId)}`;

  const SaleList = args.lines.map((line, idx) => {
    const supplyAmt = Math.round(line.QTY * line.PRICE);
    const vatAmt = Math.round(supplyAmt * 0.1); // 전부 부가세 과세대상(2026-10-22 사용자 확인)
    return {
      BulkDatas: {
        UPLOAD_SER_NO: String(idx + 1),
        IO_DATE: ioDate,
        CUST: args.cust,
        WH_CD: args.whCd,
        PROD_CD: line.PROD_CD,
        QTY: String(line.QTY),
        PRICE: String(line.PRICE),
        SUPPLY_AMT: String(supplyAmt),
        VAT_AMT: String(vatAmt),
      },
    };
  });

  let json: any;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ SaleList }),
    });
    json = await res.json();
  } catch (err: any) {
    return { ok: false, reason: `NETWORK_ERROR: ${err?.message || err}` };
  }

  const data = json?.Data;
  if (String(json?.Status) !== "200" || !data || Number(data.FailCnt) > 0) {
    // 세션 만료로 보이는 경우를 위해 캐시만 비워둔다(다음 호출에서 재로그인) — 지금 이 호출을 재시도하지는 않음.
    const cache = getSessionCache();
    cache.current = null;
    return { ok: false, reason: `SAVE_SALE_FAILED: ${JSON.stringify(json)}` };
  }

  const slipNos: string[] = Array.isArray(data.SlipNos) ? data.SlipNos.filter(Boolean) : [];
  return { ok: true, slipNos };
}
