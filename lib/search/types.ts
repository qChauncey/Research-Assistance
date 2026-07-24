/**
 * 文献检索 (Phase 2, §5.1 A / §6.3)。
 * 统一的检索结果形状——OpenAlex 与 arXiv 归一化到此，再合并去重。
 * 必须能回溯：每条要么有 DOI，要么有 OpenAlex ID / arXiv ID（§5.1 A：绝不靠 LLM 报文献）。
 */
export type SearchSource = "openalex" | "arxiv" | "semanticscholar";

export interface SearchResult {
  source: SearchSource;
  title: string;
  authors: string[];
  year?: number;
  venue?: string;
  doi?: string;
  openalex_id?: string;
  arxiv_id?: string;
  cited_by?: number;
  abstract?: string;
  url?: string;
  /** 合法开放渠道的全文 PDF 链接（arXiv / OA），供"自动获取原文" */
  oa_pdf_url?: string;
  /** 相关度（各源内部保序权重，0..1） */
  score?: number;
  /** 出版物类型（如 JournalArticle / Review / Preprint），用于质量排序 */
  pub_type?: string;
  /** 是否已撤稿（撤稿论文下沉/剔除） */
  retracted?: boolean;
}

export interface SearchRequest {
  query: string;
  sources?: SearchSource[];
  /** 检索语言（与界面语言独立，§6.1 步骤 4） */
  lang?: string;
  perSource?: number;
}

export interface SearchResponse {
  results: SearchResult[];
  errors: { source: SearchSource; message: string }[];
}
