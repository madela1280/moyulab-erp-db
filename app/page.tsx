import AppShell from "@/components/AppShell";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/lib/auth";

export default async function Page() {
  const cookieStore = await cookies(); // ✅ await 추가
  const token = cookieStore.get("token")?.value;

  // 토큰이 없으면 로그인 페이지로
  if (!token) {
    redirect("/login");
  }

  // 토큰이 유효하지 않으면 로그인 페이지로
  const decoded = verifyToken(token);
  if (!decoded || typeof decoded !== "object" || !("username" in decoded)) {
    redirect("/login");
  }

  // 토큰이 유효하면 메인 앱(AppShell) 표시
  return <AppShell />;
}
