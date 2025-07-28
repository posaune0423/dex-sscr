import { index, integer, pgTable, text, unique } from "drizzle-orm/pg-core";

/**
 * トークンテーブル - 取引可能なトークンの基本情報
 */
export const tokens = pgTable(
  "tokens",
  {
    address: text("address").primaryKey().notNull(),
    name: text("name").notNull(),
    symbol: text("symbol").notNull(),
    decimals: integer("decimals").notNull(),
    iconUrl: text("icon_url").notNull(),
  },
  (table) => [
    // インデックス定義（クエリパフォーマンス向上）
    index("tokens_symbol_idx").on(table.symbol),
    index("tokens_name_idx").on(table.name),

    // ユニーク制約
    unique("tokens_symbol_unique").on(table.symbol),
  ],
);

/**
 * 型定義（Drizzle推奨の型推論を活用）
 */
export type Token = typeof tokens.$inferSelect;
export type NewToken = typeof tokens.$inferInsert;

/**
 * 部分的更新用の型定義
 */
export type UpdateToken = Partial<Omit<NewToken, "address">>;

/**
 * Relations定義は循環参照を避けるため、
 * 別のファイルまたは後で定義する必要があります
 */
