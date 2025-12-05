import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

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
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} bg-gray-100 min-h-screen`}
      >
        {/* 화면 전체를 기준으로 자식이 꽉 차도록 */}
        <div className="w-full min-h-screen flex">
          <main className="w-full flex-1 flex flex-col min-h-0">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}







