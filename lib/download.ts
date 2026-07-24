"use client";

/** 触发浏览器下载一段文本。 */
export function downloadText(filename: string, text: string, mime = "text/plain") {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 项目标题转安全文件名。 */
export function safeName(title: string, fallback = "paper"): string {
  return title.replace(/[^\w一-龥-]+/g, "_").slice(0, 40) || fallback;
}
