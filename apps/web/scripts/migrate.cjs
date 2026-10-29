const { Pool } = require("pg");
const fs = require("node:fs");
const path = require("node:path");
(async () => {
  if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL before migrating");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(734828901)");
    await client.query("CREATE TABLE IF NOT EXISTS cinemesh_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    const directory = path.join(__dirname, "../../../packages/database/migrations");
    for (const name of fs.readdirSync(directory).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
      const prior = await client.query("SELECT 1 FROM cinemesh_migrations WHERE name=$1", [name]);
      if (prior.rowCount) continue;
      await client.query("BEGIN");
      try {
        await client.query(fs.readFileSync(path.join(directory, name), "utf8"));
        await client.query("INSERT INTO cinemesh_migrations(name) VALUES($1)", [name]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
      console.log(`Migration applied: ${name}`);
    }
  }
  finally { await client.query("SELECT pg_advisory_unlock(734828901)"); client.release(); await pool.end(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
