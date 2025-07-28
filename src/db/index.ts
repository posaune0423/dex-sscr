import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { logger } from "../utils/logger";

export * from "./schema";

import * as schema from "./schema";

let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDB() {
  if (!dbInstance) {
    if (!process.env.DATABASE_URL) {
      logger.error("DATABASE_URL is not set");
      throw new Error("DATABASE_URL must be a Neon postgres connection string");
    }

    logger.info("[DB] Connecting to Neon database");
    const sql = neon(process.env.DATABASE_URL);
    dbInstance = drizzle(sql, { schema });
  }
  return dbInstance;
}

export { schema };
