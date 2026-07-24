import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
// 先引 React Flow 基础样式，再引 globals，让我们的 token 覆盖生效（否则控件回落默认白底）。
import "@xyflow/react/dist/style.css";
import "./globals.css";

// §7.2 字体：正文 Inter，数据/标签 JetBrains Mono
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Argument Tree · 论证树研究工具",
  description:
    "一个让任何人可以结构化推进自己课题的工具。核心不是 AI 帮你想，而是把你的论证外显化，然后系统性地攻击它。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
