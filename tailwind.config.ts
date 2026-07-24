import type { Config } from "tailwindcss";

/**
 * 视觉系统 §7 —— 黑白科幻极简。
 * 所有颜色都映射到 globals.css 的 CSS 变量（token 层），
 * 组件里只引用语义名，不直接写十六进制。
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 背景层
        "bg-void": "var(--bg-void)",
        "bg-surface": "var(--bg-surface)",
        "bg-raised": "var(--bg-raised)",
        "bg-hover": "var(--bg-hover)",
        // 文本层
        "fg-primary": "var(--fg-primary)",
        "fg-secondary": "var(--fg-secondary)",
        "fg-tertiary": "var(--fg-tertiary)",
        // 结构
        border: "var(--border)",
        "border-focus": "var(--border-focus)",
        // 语义色 —— 全站仅此两处例外
        contradict: "var(--contradict)",
        dead: "var(--dead)",
      },
      fontFamily: {
        // §7.2 字体
        mono: ["var(--font-mono)", "JetBrains Mono", "monospace"],
        sans: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        // §7.3 圆角：0 或 2px，二选一
        none: "0",
        sm: "2px",
      },
      spacing: {
        // §7.3 网格：8px 基准（Tailwind 默认已是 4px 步进，这里补齐语义）
        grid: "8px",
      },
      letterSpacing: {
        label: "0.1em", // §7.2 数据/标签字距
      },
      keyframes: {
        // §7.3 动效：仅两处 —— 扫描线 + 120ms 边框闪变
        scan: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
        "border-flash": {
          "0%": { borderColor: "var(--border-focus)" },
          "100%": { borderColor: "var(--border)" },
        },
      },
      animation: {
        scan: "scan 1.6s linear infinite",
        "border-flash": "border-flash 120ms ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
