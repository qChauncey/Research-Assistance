/**
 * 研读模式的原文分段（§ 新增功能：研读）。
 *
 * 纯启发式，无 LLM：把 pdf.js 提取的整段全文切成「模块（章节）」，
 * 供左栏概览、右栏定位到对应原文。识别不了标题时优雅退化为整篇一段。
 * 之所以不用 LLM 切分：分段要快、要离线、要确定；解释/对比才交给 LLM。
 */

export interface StudySection {
  id: string;
  /** 标题（识别到的章节名，或「摘要」「全文」等退化标题） */
  title: string;
  /** 该章节的原文正文 */
  body: string;
  /** 层级：0 顶层章节，1 子节（如 2.1） */
  level: number;
}

/** 常见学术论文章节名（英文 + 少量中文），大小写不敏感，整行匹配。 */
const SECTION_WORDS = [
  "abstract",
  "introduction",
  "background",
  "related work",
  "related works",
  "literature review",
  "motivation",
  "preliminaries",
  "materials and methods",
  "methods",
  "method",
  "methodology",
  "experimental setup",
  "experiments",
  "experiment",
  "data",
  "dataset",
  "datasets",
  "model",
  "models",
  "approach",
  "results",
  "result",
  "findings",
  "evaluation",
  "analysis",
  "discussion",
  "limitations",
  "future work",
  "conclusion",
  "conclusions",
  "concluding remarks",
  "acknowledgments",
  "acknowledgements",
  "references",
  "bibliography",
  "appendix",
  "supplementary material",
  "supplementary materials",
  // 中文
  "摘要",
  "引言",
  "绪论",
  "研究背景",
  "相关工作",
  "研究方法",
  "方法",
  "实验",
  "结果",
  "讨论",
  "结论",
  "参考文献",
  "致谢",
  "附录",
];

const WORD_SET = new Set(SECTION_WORDS);

/**
 * 判断一行是否为章节标题；是则返回规范化标题与层级，否则 null。
 */
function detectHeading(raw: string): { title: string; level: number } | null {
  const line = raw.trim();
  if (line.length < 2 || line.length > 90) return null;

  // 1) 编号标题：如 "1 Introduction" / "1. Introduction" / "2.1 Something" / "3) Results"
  const numbered = line.match(/^(\d+(?:\.\d+)*)[.)]?\s+(.{2,70})$/);
  if (numbered) {
    const depth = numbered[1].split(".").length - 1;
    const rest = numbered[2].trim();
    // 编号后应像标题：首字母大写或命中关键词，且不以句号结尾（避免误抓正文句子）
    const looksTitle =
      /^[A-Z一-龥]/.test(rest) &&
      !/[.。]$/.test(rest) &&
      rest.split(/\s+/).length <= 10;
    if (looksTitle || WORD_SET.has(rest.toLowerCase())) {
      return { title: `${numbered[1]} ${rest}`, level: Math.min(depth, 1) };
    }
  }

  // 2) 罗马数字：如 "II. Methods"
  const roman = line.match(/^([IVXLC]+)[.)]\s+(.{2,70})$/);
  if (roman && /^[A-Z一-龥]/.test(roman[2])) {
    return { title: line, level: 0 };
  }

  // 3) 纯关键词整行（可带尾冒号）
  const bare = line.replace(/[:：]\s*$/, "").toLowerCase();
  if (WORD_SET.has(bare)) {
    return { title: line.replace(/[:：]\s*$/, ""), level: 0 };
  }

  // 4) 全大写短行（多为标题），排除全数字/符号
  if (
    line.length <= 48 &&
    /[A-Z]/.test(line) &&
    line === line.toUpperCase() &&
    /^[A-Z0-9 ,&:'\-]+$/.test(line) &&
    line.split(/\s+/).length <= 8
  ) {
    return { title: titleCase(line), level: 0 };
  }

  return null;
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (_, c) => c.toUpperCase());
}

let counter = 0;
function sid(): string {
  return `sec_${counter++}`;
}

/** 取一段文字的前若干字做标题（段落回退时用）。 */
function shortTitle(body: string, max = 42): string {
  const s = body.replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max) + "…" : s || "（空）";
}

/**
 * 段落回退：识别不到章节标题时，把整篇切成若干「段落」模块，
 * 保证左栏有多个模块可点、右栏总有原文可看。
 * 优先按空行分段；没有空行（pdf.js 常把全文挤成少数长行）时按句子分块。
 */
function paragraphFallback(clean: string): StudySection[] {
  // 1) 先按空行切
  let paras = clean
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  // 2) 空行分段太少 → 按句子聚合成 ~700 字的块
  if (paras.length < 2) {
    const sentences = clean
      .replace(/\s+/g, " ")
      .match(/[^.!?。！？]+[.!?。！？]+|\S[^.!?。！？]*$/g) ?? [clean];
    const chunks: string[] = [];
    let buf = "";
    for (const s of sentences) {
      buf += s;
      if (buf.length >= 700) {
        chunks.push(buf.trim());
        buf = "";
      }
    }
    if (buf.trim()) chunks.push(buf.trim());
    paras = chunks.length ? chunks : [clean];
  }

  // 合并过短的碎片到上一段，避免出现一堆一句话模块
  const merged: string[] = [];
  for (const p of paras) {
    if (merged.length && p.length < 120) {
      merged[merged.length - 1] += "\n\n" + p;
    } else {
      merged.push(p);
    }
  }

  if (merged.length < 2) {
    return [{ id: sid(), title: "全文", body: clean, level: 0 }];
  }
  return merged.map((body, i) => ({
    id: sid(),
    title: `段落 ${i + 1} · ${shortTitle(body, 28)}`,
    body,
    level: 0,
  }));
}

/**
 * 把全文切成章节。优先按学术章节标题分段；识别不到时回退为段落分段，
 * 始终返回至少一段（非空文本）。
 */
export function parseSections(text: string): StudySection[] {
  const clean = (text ?? "").replace(/\r\n?/g, "\n").trim();
  if (!clean) return [];

  const lines = clean.split("\n");
  const sections: StudySection[] = [];
  let current: StudySection | null = null;
  const preamble: string[] = [];

  for (const rawLine of lines) {
    const h = detectHeading(rawLine);
    if (h) {
      if (current) sections.push(current);
      current = { id: sid(), title: h.title, body: "", level: h.level };
    } else if (current) {
      current.body += (current.body ? "\n" : "") + rawLine;
    } else {
      preamble.push(rawLine);
    }
  }
  if (current) sections.push(current);

  // 丢弃正文为空的标题段（提取噪声）
  const withBody = sections.filter((s) => s.body.trim().length > 0);

  // 首个标题前的内容 → 作为「开头」段（通常含标题/作者/摘要）
  const pre = preamble.join("\n").trim();
  if (pre) {
    withBody.unshift({ id: sid(), title: "开头", body: pre, level: 0 });
  }

  // 识别到 ≥2 个真正的章节 → 用它
  if (withBody.length >= 2) return withBody;

  // 否则回退到段落分段（保证多模块 + 右栏有原文）
  return paragraphFallback(clean);
}

/** 章节正文的简短预览（左栏概览用）。 */
export function sectionPreview(body: string, max = 120): string {
  const s = body.replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
}
