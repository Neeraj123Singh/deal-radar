import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { config } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function migrate(): Promise<void> {
  const sql = postgres(config.databaseUrl, { max: 1 });
  const schemaPath = path.join(__dirname, "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf-8");
  await sql.unsafe(schema);
  await sql.end();
  console.log("[db] migrations applied");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate().catch((err) => {
    console.error("[db] migration failed:", err);
    process.exit(1);
  });
}

export function createDb() {
  return postgres(config.databaseUrl, { max: 10 });
}

export type Sql = ReturnType<typeof createDb>;
