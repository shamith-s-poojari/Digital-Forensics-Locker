// Copies an existing .data/ folder into the Postgres database named by DATABASE_URL. Reads the same variables as the
// server (DATA_DIR, CASE_STORE, ACCESS_REQUEST_STORE, EVIDENCE_KEY_STORE, EVIDENCE_KEY_ACCESS_LOG) from the environment
// or .env. All or nothing, and safe to run again: records already in the database are left alone. The files are not
// changed. Wrapped keys stay wrapped, so the server needs the same EVIDENCE_MASTER_KEY afterwards.
//
//   npm run import:data
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { fileStoragePaths } from "../server/api.js";
import { createFileStorage } from "../server/storage/fileStorage.js";
import { createPostgresStorage } from "../server/storage/postgresStorage.js";

const env = { ...(existsSync(".env") ? parseEnv(readFileSync(".env", "utf8")) : {}), ...process.env };
if (!env.DATABASE_URL) {
  console.error("DATABASE_URL is not set: nowhere to import to.");
  process.exit(1);
}

const paths = fileStoragePaths(env);
const target = createPostgresStorage({ connectionString: env.DATABASE_URL });
try {
  const result = await target.importFrom(createFileStorage(paths));
  for (const [name, { copied, skipped }] of Object.entries(result)) console.log(`${name}: ${copied} copied, ${skipped} already there`);
} catch (err) {
  console.error(`Import failed, nothing was copied: ${err.message}`);
  process.exitCode = 1;
} finally {
  await target.close();
}
