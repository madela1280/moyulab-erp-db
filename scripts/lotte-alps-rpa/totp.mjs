// scripts/lotte-alps-rpa/totp.mjs
//
// RFC 6238 TOTP 코드 생성기 (외부 패키지 없이 Node 내장 crypto만 사용).
// ALPS 포털의 QR코드 OTP 앱(TOTP)과 동일한 방식으로 6자리 코드를 생성한다.
// LOTTE_ALPS_TOTP_SECRET은 OTP 앱 등록 시 나오는 Base32 비밀키(QR코드 안의 secret 값)여야 한다.

import crypto from "crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(input) {
  const clean = String(input ?? "").trim().toUpperCase().replace(/=+$/g, "");
  let bits = "";
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    bits += idx.toString(2).padStart(5, "0");
  }

  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

export function generateTotp(secretBase32, { digits = 6, period = 30, at = Date.now() } = {}) {
  const key = base32Decode(secretBase32);
  if (!key.length) throw new Error("INVALID_TOTP_SECRET");

  const counter = Math.floor(at / 1000 / period);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));

  const hmac = crypto.createHmac("sha1", key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;

  const binCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const code = String(binCode % 10 ** digits).padStart(digits, "0");
  return code;
}
