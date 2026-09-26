import path from "node:path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "./db";

if (process.env.RUN_MIGRATIONS !== "false") {
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  console.log("[db] migrations applied");
}
