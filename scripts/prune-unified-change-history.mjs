// scripts/prune-unified-change-history.mjs

import pg from "pg";

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("[prune-unified-change-history] DATABASE_URL is required");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
});

async function main() {
  const client = await pool.connect();

  try {
    console.log("[prune-unified-change-history] start");

    const result = await client.query(`
      DELETE FROM unified_change_operations
      WHERE created_at < NOW() - INTERVAL '8 days'
      RETURNING operation_id
    `);

    console.log(
      `[prune-unified-change-history] deleted operations: ${result.rowCount}`
    );

    console.log("[prune-unified-change-history] done");
  } catch (err) {
    console.error("[prune-unified-change-history] failed:", err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();