import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "애덤스미스 출석",
  description: "빠르고 간편한 현장 출석 서비스",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
