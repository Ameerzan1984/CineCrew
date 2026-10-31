import { Pool } from "pg";
const globalForDb = globalThis as unknown as { cinePool?: Pool };
export function database() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  if (!globalForDb.cinePool) globalForDb.cinePool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  return globalForDb.cinePool;
}
