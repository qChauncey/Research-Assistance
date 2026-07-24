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

/**
 * 把全文切成章节。识别不到任何标题时，返回单段「全文」。
 */
export function parseSections(text: string): StudySection[] {
  const clean = (text ?? "").replace(/\r\n?/g, "\n").trim();
  if (!clean) return [];

  const lines = clean.split("\n");
  const sections: StudySection[] = [];
  let current: StudySection | null = null;
  let preamble: string[] = [];

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

  // 首个标题前的内容 → 作为「开头」段（通常含标题/作者/摘要）
  const pre = preamble.join("\n").trim();
  if (pre) {
    sections.unshift({ id: sid(), title: "开头", body: pre, level: 0 });
  }

  // 没识别到任何标题 → 整篇一段
  if (sections.length === 0) {
    return [{ id: sid(), title: "全文", body: clean, level: 0 }];
  }
  // 只有一个「开头」段且没有真正章节 → 更名为全文
  if (sections.length === 1 && sections[0].title === "开头") {
    sections[0].title = "全文";
  }
  // 丢弃正文为空的标题段（提取噪声）
  return sections.filter((s) => s.body.trim().length > 0 || s.title === "全文");
}

/** 章节正文的简短预览（左栏概览用）。 */
export function sectionPreview(body: string, max = 120): string {
  const s = body.replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
}
