import type { Domain } from "@/lib/db/schema";
import type { DomainSchema, NodeTypeDef } from "./types";
import { general } from "./general";
import { physics } from "./physics";
import { experimental } from "./experimental";
import { social } from "./social";

/**
 * 领域配置注册表（约束六：加第五个领域是在此登记一份配置，不是开分支）。
 */
export const DOMAINS: Record<Domain, DomainSchema> = {
  general,
  physics,
  experimental,
  social,
};

export const DOMAIN_ORDER: Domain[] = [
  "general",
  "physics",
  "experimental",
  "social",
];

export function getDomain(domain: Domain): DomainSchema {
  return DOMAINS[domain];
}

/** 查某领域下的节点类型定义。UI 下拉框必须从此动态生成，不硬编码。 */
export function getNodeTypeDef(
  domain: Domain,
  nodeTypeId: string,
): NodeTypeDef | undefined {
  return DOMAINS[domain].nodeTypes.find((t) => t.id === nodeTypeId);
}

export type { DomainSchema, NodeTypeDef };
export * from "./types";
