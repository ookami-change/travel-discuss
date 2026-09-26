import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pg?: ReturnType<typeof postgres> };

// postgres.js connects lazily, so importing this during `next build` is harmless.
globalForDb.pg ??= postgres(process.env.DATABASE_URL || "postgres://localhost:5432/travel_discuss", { max: 10 });

export const db = drizzle({ client: globalForDb.pg, schema });

export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
