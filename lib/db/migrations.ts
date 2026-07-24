/**
 * 导入迁移器 (§4.1) —— 链式 v1→v2→v3，只向前迁移，不支持向后。
 *
 * 一开始就写，哪怕现在只有 v1。没有它，三个月后用户传一个旧格式文件系统就卡死。
 * 每个迁移函数把 payload 从版本 N 升到 N+1，只做纯数据变换。
 */
import { SCHEMA_VERSION } from "./schema";

export interface ExportPayload {
  format: string;
  schema_version: number;
  exported_at: string;
  project: unknown;
  nodes: unknown[];
  evidence: unknown[];
  candidates: unknown[];
  library_items?: unknown[];
  papers_cache?: unknown[];
  checksum?: string;
  [k: string]: unknown;
}

type Migration = (data: ExportPayload) => ExportPayload;

/**
 * 迁移登记表：键 N 表示"把 vN 升到 v(N+1)"的函数。
 * 加新版本时：把 SCHEMA_VERSION 提到新值，并在此登记 N→N+1 的变换。
 */
const MIGRATIONS: Record<number, Migration> = {
  // 示例（当前无需，占位说明后续如何加）：
  // 1: (data) => { /* v1 → v2：为每个 node 补默认字段 */ return { ...data, schema_version: 2 }; },
};

export class MigrationError extends Error {}

/**
 * 把导入数据迁移到当前 SCHEMA_VERSION。
 * - 文件版本 > 当前：拒绝（本工具版本太旧，无法向后迁移）。
 * - 文件版本 = 当前：原样返回。
 * - 文件版本 < 当前：链式逐级向前迁移。
 */
export function migrateToLatest(data: ExportPayload): ExportPayload {
  let version = data.schema_version;

  if (typeof version !== "number") {
    throw new MigrationError("导入文件缺少 schema_version 字段");
  }
  if (version > SCHEMA_VERSION) {
    throw new MigrationError(
      `文件 schema_version (${version}) 高于本工具支持的版本 (${SCHEMA_VERSION})，请升级工具。`,
    );
  }

  let migrated = data;
  while (version < SCHEMA_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) {
      throw new MigrationError(
        `缺少从 v${version} 到 v${version + 1} 的迁移函数`,
      );
    }
    migrated = migrate(migrated);
    version += 1;
  }
  return migrated;
}
