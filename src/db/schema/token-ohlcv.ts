import { index, integer, numeric, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { tokens } from "./tokens";

export const tokenOHLCV = pgTable(
  "token_ohlcv",
  {
    token: text("token")
      .notNull()
      .references(() => tokens.address),
    timestamp: integer("timestamp").notNull(), // UNIX timestamp in seconds
    open: numeric("open").notNull(),
    high: numeric("high").notNull(),
    low: numeric("low").notNull(),
    close: numeric("close").notNull(),
    volume: numeric("volume").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.token, table.timestamp] }),
    index("token_ohlcv_token_timestamp_idx").on(table.token, table.timestamp.desc()),
    index("token_ohlcv_timestamp_idx").on(table.timestamp.desc()),
  ],
);

export type TokenOHLCV = typeof tokenOHLCV.$inferSelect;
export type NewTokenOHLCV = typeof tokenOHLCV.$inferInsert;
