export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.RUN_MIGRATIONS === "false") return;
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const { db } = await import("./db");
  const path = await import("node:path");
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  console.log("[db] migrations applied");
}
