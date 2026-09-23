// scripts/lotte-alps-rpa/scrape.mjs
//
// 롯데글로벌로지스틱스 ALPS 포털 로그인 + "통합관리 운송장출력" 화면 조회/추출.
//
// ⚠️ 중요: 아래 SELECTORS 값들은 실제 로그인 후 화면(DevTools)을 보지 않고는 정확히 알 수 없어서
// 자리표시(placeholder)로 채워두었다. 실제 실행 전에 반드시 로그인해서 각 요소를 우클릭 →
// "검사(Inspect)"로 실제 선택자를 확인하고 이 파일의 SELECTORS 객체만 고쳐야 한다.
// (로그인/조회 로직 흐름 자체는 그대로 두고 선택자만 교체하면 됨)

import { chromium } from "playwright";
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

  // "통합관리 운송장출력" 화면 — 메뉴 경로: 전체화면 → 집배달 → 통합관리 운송장출력
  fullScreenMenuButton: "text=전체화면", // TODO: 정확한 선택자 DevTools로 확인 필요(텍스트 기준 추정)
  pickupDeliveryMenuLink: "text=집배달", // TODO: 정확한 선택자 DevTools로 확인 필요(텍스트 기준 추정)
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

// ✅ 이 사이트는 메뉴 클릭 시 새 탭의 iframe 안에 화면이 뜨는 구조라(id가 매번 달라짐),
//    주어진 선택자가 들어있는 iframe(frame)을 모든 프레임 중에서 찾아 반환한다.
async function findFrameContaining(page, selector, { timeoutMs = 15000, intervalMs = 500 } = {}) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      try {
        const el = await frame.$(selector);
        if (el) return frame;
      } catch {
        // 프레임이 막 사라지거나 교체되는 중일 수 있음 — 무시하고 계속
      }
    }
    await page.waitForTimeout(intervalMs);
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

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

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
    // ✅ 2026-09-23: "전체화면" 클릭은 불필요한 것으로 확인되어 제거함. 집배달 → 통합관리 운송장출력만 클릭.
    await page.click(SELECTORS.pickupDeliveryMenuLink);
    await page.click(SELECTORS.waybillOutputMenuLink);
    await page.waitForLoadState("networkidle");

    // ✅ 이 사이트는 메뉴를 누르면 새 탭의 iframe 안에 실제 화면이 로드되는 MDI 구조(2026-09-23 확인).
    //    그래서 조회버튼/그리드는 최상위 page가 아니라 그 iframe 안에서 찾아야 한다.
    //    어떤 iframe인지 미리 알 수 없으므로, 조회버튼이 들어있는 iframe을 직접 찾는다.
    const targetFrame = await findFrameContaining(page, SELECTORS.searchButton);
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
    // ✅ 실패 시 그 순간 화면을 사진으로 저장(headless라 화면을 직접 볼 수 없어서 디버깅용)
    try {
      const shotPath = `/tmp/lotte-alps-debug-${Date.now()}.png`;
      await page.screenshot({ path: shotPath, fullPage: true });
      console.error(`실패 시점 화면 저장됨: ${shotPath}`);
    } catch {
      // 스크린샷 저장 자체가 실패해도 원래 에러를 그대로 던진다
    }
    throw err;
  } finally {
    await browser.close();
  }
}
