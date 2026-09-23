// scripts/lotte-alps-rpa/scrape.mjs
//
// 롯데글로벌로지스틱스 ALPS 포털 로그인 + "통합관리 운송장출력" 화면 조회/추출.
//
// ⚠️ 중요: 아래 SELECTORS 값들은 실제 로그인 후 화면(DevTools)을 보지 않고는 정확히 알 수 없어서
// 자리표시(placeholder)로 채워두었다. 실제 실행 전에 반드시 로그인해서 각 요소를 우클릭 →
// "검사(Inspect)"로 실제 선택자를 확인하고 이 파일의 SELECTORS 객체만 고쳐야 한다.
// (로그인/조회 로직 흐름 자체는 그대로 두고 선택자만 교체하면 됨)

import { chromium } from "playwright";
import fs from "fs";
import { generateTotp } from "./totp.mjs";

const LOGIN_URL = "https://partner.alps.llogis.com/main/pages/sec/authentication";

// ✅ 로그인 필드는 2026-09-22 실제 DevTools 캡처로 확인됨(아이디/비번/로그인버튼)
// ⚠️ OTP 관련 선택자는 아직 미확인 — OTP 입력창이 뜰 때 다시 캡처 필요
const SELECTORS = {
  loginIdInput: "input[name='principal']",
  loginPwInput: "input[name='credential']",
  loginSubmitButton: "#btn-login",
  otpInput: "#otpCode", // TODO: OTP 입력 팝업(otpVerifyPop) 뜰 때 실제 input 선택자로 교체
  otpSubmitButton: "#otpSubmit", // TODO: OTP 확인 버튼 실제 선택자로 교체

  // ✅ "통합관리 운송장출력" 화면 — 실제 클릭 경로(2026-09-23 확인): 집배달 → 집하지시 → 통합관리 운송장출력
  //    ("전체화면"은 클릭 버튼이 아니라 로그인 후 자동으로 그렇게 되는 상태 표시였음 — 클릭 불필요)
  pickupDeliveryMenuLink: "text=집배달", // TODO: 정확한 선택자 DevTools로 확인 필요(텍스트 기준 추정)
  pickupInstructionMenuLink: "text=집하지시", // TODO: 정확한 선택자 DevTools로 확인 필요(텍스트 기준 추정)
  waybillOutputMenuLink: "text=통합관리 운송장출력", // TODO: 정확한 선택자 DevTools로 확인 필요(텍스트 기준 추정)
  // ✅ 집하일자는 기본값이 항상 "오늘"이라 평소엔 안 건드려도 됨(2026-09-22 확인)
  pickupDateFromInput: null, // 기본값이 오늘이므로 보통 사용 안 함(다른 범위 필요시만 채움)
  pickupDateToInput: null,
  // ✅ 2026-09-22 실제 DevTools 캡처로 확인됨
  searchButton: ".searchBtn",
  // ✅ 결과 화면은 일반 <table>이 아니라 커스텀 그리드 컴포넌트(<i-grid id="gridRsrv">)로 확인됨(2026-09-22)
  resultGridId: "gridRsrv",
};

// ✅ 2026-09-22 <i-grid columns="..."> 속성(실제 컬럼 정의 JSON)에서 확인된 실제 필드명.
//    수하인전화번호(acperTelView) 컬럼이 실제로 존재함을 확인함 — 다운로드 파일엔 없지만 이 화면엔 있음.
const GRID_FIELDS = {
  운송장번호: "invNo",
  주문번호: "ordrNo",
  수하인명: "acperNmView",
  수하인전화번호: "acperTelView",
  수하인기본주소: "acperBadrView",
  수하인상세주소: "acperDetcAdrView",
};

// 결과 테이블(구형 <table> 렌더링일 경우 대비용 예비 인덱스) — i-grid 방식이 우선이며 이건 fallback일 뿐.
const COLUMN_INDEX_FALLBACK = {
  운송장번호: 6,
  주문번호: 9,
  수하인명: 15,
  수하인전화번호: 16,
  수하인주소: 17,
};

function cellText(cells, idx) {
  const el = cells[idx];
  return el ? el.trim() : "";
}

// ✅ 이 사이트는 메뉴 클릭 시 "탭"처럼 보이지만 실제로는 새 브라우저 창(팝업)으로 내용이 뜨는 것으로
//    추정됨(2026-09-23: 탭 제목은 바로 뜨는데 내용은 계속 비어있는 현상 확인) — 원래 page의 iframe뿐
//    아니라, 같은 브라우저 context 안에서 새로 열린 페이지(팝업)까지 전부 뒤진다.
async function findFrameContaining(context, selector, { timeoutMs = 15000, intervalMs = 500 } = {}) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    for (const pg of context.pages()) {
      for (const frame of pg.frames()) {
        try {
          const el = await frame.$(selector);
          if (el) return frame;
        } catch {
          // 프레임이 막 사라지거나 교체되는 중일 수 있음 — 무시하고 계속
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return null;
}

/**
 * @param {object} opts
 * @param {string} opts.username
 * @param {string} opts.password
 * @param {string} opts.totpSecret
 * @param {string} opts.fromDate - YYYY-MM-DD (집하일자 시작)
 * @param {string} opts.toDate - YYYY-MM-DD (집하일자 끝, 보통 오늘)
 * @returns {Promise<Array<{운송장번호:string, 주문번호:string, 수하인명:string, 수하인전화번호:string, 수하인주소:string}>>}
 */
export async function scrapeAlpsWaybills({ username, password, totpSecret, fromDate, toDate }) {
  if (!username || !password) throw new Error("MISSING_CREDENTIALS");

  // ✅ 2026-09-23: pid.alps.llogis.com:18210 요청이 net::ERR_ABORTED로 끊기는 현상 확인.
  //    자동화 브라우저 감지(anti-bot) 가능성이 있어, 표준적인 우회 옵션(navigator.webdriver 숨기기) 적용.
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  const page = await context.newPage();

  // ✅ 디버깅용: 브라우저 안에서 나는 에러/콘솔 메시지를 전부 기록(클릭은 되는데 로딩이
  //    시작을 안 하는 원인을 찾기 위함 — 2026-09-23)
  const consoleLogPath = "/tmp/lotte-alps-console.log";
  const consoleLines = [];
  function logConsole(line) {
    consoleLines.push(line);
    try {
      fs.writeFileSync(consoleLogPath, consoleLines.join("\n"));
    } catch {
      // ignore
    }
  }
  context.on("page", (pg) => {
    pg.on("console", (msg) => logConsole(`[console:${msg.type()}] ${pg.url()} :: ${msg.text()}`));
    pg.on("pageerror", (err) => logConsole(`[pageerror] ${pg.url()} :: ${err?.message ?? err}`));
    pg.on("requestfailed", (req) =>
      logConsole(`[requestfailed] ${req.url()} :: ${req.failure()?.errorText ?? ""}`)
    );
  });
  page.on("console", (msg) => logConsole(`[console:${msg.type()}] ${page.url()} :: ${msg.text()}`));
  page.on("pageerror", (err) => logConsole(`[pageerror] ${page.url()} :: ${err?.message ?? err}`));
  page.on("requestfailed", (req) =>
    logConsole(`[requestfailed] ${req.url()} :: ${req.failure()?.errorText ?? ""}`)
  );

  try {
    await page.goto(LOGIN_URL, { waitUntil: "networkidle" });

    await page.fill(SELECTORS.loginIdInput, username);
    await page.fill(SELECTORS.loginPwInput, password);
    await page.click(SELECTORS.loginSubmitButton);

    // OTP 입력창이 뜨는 경우에만 처리(안 뜨면 일정 시간 내 다음 화면으로 자동 진행)
    const otpAppeared = await page
      .waitForSelector(SELECTORS.otpInput, { timeout: 5000 })
      .then(() => true)
      .catch(() => false);

    if (otpAppeared) {
      if (!totpSecret) throw new Error("OTP_REQUIRED_BUT_NO_SECRET");
      const code = generateTotp(totpSecret);
      await page.fill(SELECTORS.otpInput, code);
      await page.click(SELECTORS.otpSubmitButton);
    }

    await page.waitForLoadState("networkidle");

    // "통합관리 운송장출력" 화면으로 이동
    // ✅ 2026-09-23 확인: "전체화면"은 클릭 버튼이 아니라 로그인 후 자동으로 그렇게 되는 상태 표시였음.
    //    실제 클릭 경로: 집배달 → 집하지시 → 통합관리 운송장출력 (3단계)
    // ✅ 이 사이트는 메뉴를 누르면 새 탭의 iframe 안에 실제 화면이 로드되는 MDI 구조(2026-09-23 확인).
    //    가끔 탭은 열려도 안쪽 내용이 안 뜨는 경우가 있어(원인 불명), 몇 번 재시도한다.
    // ✅ 디버깅용: 각 클릭 직후 사진을 남겨서 어느 단계에서 틀어지는지 확인.
    //    새 창(팝업)이 열렸을 수도 있으니, 그 시점의 모든 창을 다 찍는다.
    async function debugShot(label) {
      const pages = context.pages();
      console.error(`[디버그] ${label} — 열려있는 창 ${pages.length}개:`, pages.map((p) => p.url()));
      for (let i = 0; i < pages.length; i++) {
        try {
          const p = `/tmp/lotte-alps-step-${label}-win${i}.png`;
          await pages[i].screenshot({ path: p });
          console.error(`[디버그] ${label} 창${i} 사진: ${p}`);
        } catch {
          // ignore
        }
      }
    }

    let targetFrame = null;
    const MAX_NAV_ATTEMPTS = 1; // ✅ 재시도해도 결과가 같아서 일단 1회만 하고 단계별로 원인 확인

    for (let attempt = 1; attempt <= MAX_NAV_ATTEMPTS && !targetFrame; attempt++) {
      await debugShot("0-before-click");

      await page.click(SELECTORS.pickupDeliveryMenuLink);
      await page.waitForTimeout(2000); // 하위메뉴 렌더링 대기
      await debugShot("1-after-집배달");

      await page.click(SELECTORS.pickupInstructionMenuLink);
      await page.waitForTimeout(2000); // 하위메뉴 렌더링 대기
      await debugShot("2-after-집하지시");

      await page.click(SELECTORS.waybillOutputMenuLink);
      await page.waitForTimeout(3000); // 탭 생성 + iframe src 로딩 대기
      await page.waitForLoadState("networkidle").catch(() => {});
      await debugShot("3-after-통합관리운송장출력");

      targetFrame = await findFrameContaining(context, SELECTORS.searchButton, { timeoutMs: 20000 });

      if (!targetFrame) {
        console.warn(`통합관리 운송장출력 화면 로딩 실패 — 재시도 ${attempt}/${MAX_NAV_ATTEMPTS}`);
      }
    }

    if (!targetFrame) throw new Error("WAYBILL_SCREEN_FRAME_NOT_FOUND");

    // ✅ 집하일자 기본값이 항상 "오늘"이라, 다른 범위가 필요할 때만 날짜를 바꾼다
    if (fromDate && SELECTORS.pickupDateFromInput) await targetFrame.fill(SELECTORS.pickupDateFromInput, fromDate);
    if (toDate && SELECTORS.pickupDateToInput) await targetFrame.fill(SELECTORS.pickupDateToInput, toDate);

    await targetFrame.click(SELECTORS.searchButton);
    await page.waitForLoadState("networkidle");

    // ✅ 1차 시도: i-grid 컴포넌트의 실제 데이터를 JS로 직접 읽기(가장 안정적 — 화면 배치 안 타는 방식)
    //    ⚠️ 이 컴포넌트가 데이터를 어느 프로퍼티(.data/.rows/.dataset 등)에 두는지는 실행해봐야 확인 가능.
    //    아래는 흔한 패턴 3가지를 순서대로 시도하고, 다 실패하면 2차 시도(표 스크래핑)로 넘어간다.
    const gridRows = await targetFrame.evaluate((gridId) => {
      const el = document.getElementById(gridId);
      if (!el) return null;
      const candidates = [el.data, el.rows, el.dataset_, el.gridData, el.items];
      for (const c of candidates) {
        if (Array.isArray(c) && c.length) return c;
      }
      return null;
    }, SELECTORS.resultGridId);

    const results = [];
    const seenInvoiceNos = new Set();

    if (gridRows) {
      // ✅ i-grid 데이터에서 바로 추출(필드명 기준 — GRID_FIELDS)
      for (const row of gridRows) {
        const 운송장번호 = String(row?.[GRID_FIELDS.운송장번호] ?? "").trim();
        if (!운송장번호) continue;
        if (seenInvoiceNos.has(운송장번호)) continue; // 합포장 중복 제거
        seenInvoiceNos.add(운송장번호);

        results.push({
          운송장번호,
          주문번호: String(row?.[GRID_FIELDS.주문번호] ?? "").trim(),
          수하인명: String(row?.[GRID_FIELDS.수하인명] ?? "").trim(),
          수하인전화번호: String(row?.[GRID_FIELDS.수하인전화번호] ?? "").trim(),
          수하인주소: String(row?.[GRID_FIELDS.수하인기본주소] ?? "").trim(),
        });
      }
      return results;
    }

    // ✅ 2차 시도(fallback): i-grid에서 데이터를 못 읽었을 때만 일반 표처럼 스크래핑 시도
    console.warn("i-grid 데이터 직접 읽기 실패 — 표 스크래핑으로 대체 시도(정확도 낮을 수 있음)");
    const rows = await targetFrame
      .$$eval(`#${SELECTORS.resultGridId} table tbody tr`, (trs) =>
        trs.map((tr) => Array.from(tr.querySelectorAll("td")).map((td) => td.textContent ?? ""))
      )
      .catch(() => []);

    for (const cells of rows) {
      const 운송장번호 = cellText(cells, COLUMN_INDEX_FALLBACK.운송장번호);
      if (!운송장번호) continue;
      if (seenInvoiceNos.has(운송장번호)) continue;
      seenInvoiceNos.add(운송장번호);

      results.push({
        운송장번호,
        주문번호: cellText(cells, COLUMN_INDEX_FALLBACK.주문번호),
        수하인명: cellText(cells, COLUMN_INDEX_FALLBACK.수하인명),
        수하인전화번호: cellText(cells, COLUMN_INDEX_FALLBACK.수하인전화번호),
        수하인주소: cellText(cells, COLUMN_INDEX_FALLBACK.수하인주소),
      });
    }

    return results;
  } catch (err) {
    // ✅ 실패 시 그 순간 화면을 사진으로 저장(headless라 화면을 직접 볼 수 없어서 디버깅용) — 모든 창 대상
    try {
      const pages = context.pages();
      for (let i = 0; i < pages.length; i++) {
        const shotPath = `/tmp/lotte-alps-debug-${Date.now()}-win${i}.png`;
        await pages[i].screenshot({ path: shotPath, fullPage: true });
        console.error(`실패 시점 화면 저장됨(창${i}): ${shotPath}`);
        console.error(`창${i} 프레임 목록:`, pages[i].frames().map((f) => f.url()));
      }
    } catch {
      // 스크린샷 저장 자체가 실패해도 원래 에러를 그대로 던진다
    }
    throw err;
  } finally {
    await browser.close();
  }
}
