// app/views/unified/extensions/extensionFormat.ts

export type ExtensionCellFields = {
  days: string | null; // "30"
  paymentMethod: string | null; // "계좌이체"
  amount: string | null; // "20000"
  receivedDate: string | null; // "YYYY-MM-DD"
};

/**
 * 셀 표시 포맷: "연장일수/결제수단/금액/접수일"
 * 예) 30/계좌이체/20000/26.01.02
 *
 * - 날짜는 YYYY-MM-DD 를 받아서 YY.MM.DD 로 표기
 * - 빈 값은 빈 문자열로 두고, trailing 빈값은 뒤쪽부터 제거
 */
export function formatExtensionCell(f: ExtensionCellFields): string {
  const days = normalize(f.days);
  const pay = normalize(f.paymentMethod);
  const amount = normalize(f.amount);
  const dateYY = formatYYMMDD(normalize(f.receivedDate));

  const parts = [days, pay, amount, dateYY];

  // 뒤쪽 빈값은 제거(표시 깔끔)
  while (parts.length && !String(parts[parts.length - 1] ?? "").trim()) parts.pop();

  return parts.join("/");
}

/**
 * 셀 문자열 파싱
 * - "30/계좌이체/20000/26.01.02"
 * - "30/계좌이체"
 * - "" (비어있음)
 */
export function parseExtensionCell(text: string): ExtensionCellFields {
  const raw = String(text ?? "").trim();
  if (!raw) {
    return { days: null, paymentMethod: null, amount: null, receivedDate: null };
  }

  const parts = raw.split("/").map((s) => String(s ?? "").trim());

  const days = normalize(parts[0]);
  const paymentMethod = normalize(parts[1]);
  const amount = normalize(parts[2]);

  const receivedDate = parseYYMMDD(parts[3]) ?? parseYYYYMMDD(parts[3]) ?? null;

  return {
    days: days || null,
    paymentMethod: paymentMethod || null,
    amount: amount || null,
    receivedDate,
  };
}

function normalize(v: any) {
  return String(v ?? "").trim();
}

function formatYYMMDD(yyyyMMdd: string) {
  const s = String(yyyyMMdd ?? "").trim();
  if (!s) return "";
  // expects YYYY-MM-DD
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return `${m[1].slice(2)}.${m[2]}.${m[3]}`;
}

function parseYYMMDD(s: string) {
  const t = String(s ?? "").trim();
  if (!t) return null;
  const m = t.match(/^(\d{2})\.(\d{2})\.(\d{2})$/);
  if (!m) return null;

  // 00~79 => 2000s, 80~99 => 1900s (보수적)
  const yy = Number(m[1]);
  const year = yy <= 79 ? 2000 + yy : 1900 + yy;
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  if (!isValidYMD(year, mm, dd)) return null;

  return `${year}-${pad2(mm)}-${pad2(dd)}`;
}

function parseYYYYMMDD(s: string) {
  const t = String(s ?? "").trim();
  if (!t) return null;
  const m = t.match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
  if (!m) return null;

  const year = Number(m[1]);
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  if (!isValidYMD(year, mm, dd)) return null;

  return `${year}-${pad2(mm)}-${pad2(dd)}`;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function isValidYMD(y: number, m: number, d: number) {
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}