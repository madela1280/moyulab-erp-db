import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

const SECRET = process.env.JWT_SECRET || "moyulab_secret_key";

/** ✅ 토큰 생성 (로그인 시 사용) */
export function createToken(payload: object) {
  return jwt.sign(payload, SECRET, { expiresIn: "365d" });
}

/** ✅ 토큰 검증 */
export function verifyToken(token: string) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

/** ✅ 세션 유저 추출 (쿠키 기반 로그인 확인용) */
export async function getSessionUser() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return null;

    const decoded = verifyToken(token);
    if (!decoded || typeof decoded !== "object" || !("username" in decoded)) {
      return null;
    }

    return decoded as {
      username: string;
      role?: string;
      name?: string;
      phone?: string;
    };
  } catch {
    return null;
  }
}
