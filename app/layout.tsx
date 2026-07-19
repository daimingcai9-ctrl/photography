import type { Metadata } from "next";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: {
    default: "光影视界 - 个人摄影作品",
    template: "%s | 光影视界",
  },
  description: "用色彩定义每一帧，用镜头记录每一刻",
  applicationName: "光影视界",
  openGraph: {
    type: "website",
    locale: "zh_CN",
    siteName: "光影视界",
    title: "光影视界 - 个人摄影作品",
    description: "用色彩定义每一帧，用镜头记录每一刻",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="antialiased dark">
      <body className="min-h-screen bg-black text-white overflow-x-hidden">
        <Navbar />
        <main>{children}</main>
      </body>
    </html>
  );
}
