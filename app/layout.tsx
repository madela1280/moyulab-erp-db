import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "../public/output.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Moyulab ERP",
  description: "모유랩 ERP 시스템",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-100 min-h-screen`}
        suppressHydrationWarning
      >
        {/* ❌ 기존: flex + 가운데 정렬 때문에 UI 다 망가짐 */}
        {/* <main className="flex flex-col items-center justify-center min-h-screen w-full"> */}

        {/* ✅ 수정: 기본 흐름(좌측 상단 정렬) + 전체 폭 */}
        <main className="w-full min-h-screen">
          {children}
        </main>

      </body>
    </html>
  );
}


