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
        <div className="w-full flex flex-col items-start">
          <main className="w-full min-h-screen">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}






