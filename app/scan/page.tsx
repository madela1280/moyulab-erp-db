// app/scan/page.tsx
//
// 롯데택배 스캔 전용 화면. PM84 등에서 바로가기로 저장해두고 곧장 들어오기 위한 전용 주소.
// (메뉴 많은 메인 화면(AppShell)을 거치지 않고 로그인만 확인한 뒤 스캔 화면만 바로 보여줌)

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/lib/auth";
import ScanView from "@/views/lotteShipment/ScanView";

export default async function ScanPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;

  if (!token) {
    redirect("/login");
  }

  const decoded = verifyToken(token);
  if (!decoded || typeof decoded !== "object" || !("username" in decoded)) {
    redirect("/login");
  }

  return <ScanView />;
}
