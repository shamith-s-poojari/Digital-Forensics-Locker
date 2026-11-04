// Test helper: every store's suite runs against each storage backend. Postgres runs when TEST_DATABASE_URL is set
// (CI always sets it); each test gets its own schema, dropped afterwards.
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { afterEach, beforeEach } from "vitest";
import { createFileStorage } from "./fileStorage.js";
import { createPostgresStorage } from "./postgresStorage.js";

const url = process.env.TEST_DATABASE_URL;

export const fileBackend = {
  name: "file",
  async open() {
    const dir = await mkdtemp(join(tmpdir(), "dfl-storage-"));
    const paths = {
      caseFile: join(dir, "cases.json"),
      accessRequestFile: join(dir, "access-requests.json"),
      keyFile: join(dir, "keys.json"),
      accessLogFile: join(dir, "access.log"),
    };
    return {
      paths,
      newStorage: () => createFileStorage(paths),
      close: () => rm(dir, { recursive: true, force: true }),
    };
  },
};

export const postgresBackend = {
  name: "postgres",
  async open() {
    const schema = `test_${randomBytes(8).toString("hex")}`;
    const admin = new pg.Client({ connectionString: url });
    await admin.connect();
    await admin.query(`CREATE SCHEMA ${schema}`);
    const opened = [];
    const config = { connectionString: url, options: `-c search_path=${schema}`, max: 3 };
    return {
      config,
      newStorage() {
        const storage = createPostgresStorage(config);
        opened.push(storage);
        return storage;
      },
      /** Runs SQL as the owner, in this test's schema, for tests that go behind the API's back. */
      async sql(text, params) {
        await admin.query(`SET search_path = ${schema}`);
        return admin.query(text, params);
      },
      async close() {
        await Promise.all(opened.map((storage) => storage.close()));
        await admin.query(`DROP SCHEMA ${schema} CASCADE`);
        await admin.end();
      },
    };
  },
};

export const backends = url ? [fileBackend, postgresBackend] : [fileBackend];

/** Inside a describe: opens the backend for each test and hands it to `use`. */
export function useBackend(backend, use) {
  let harness;
  beforeEach(async () => {
    harness = await backend.open();
    use(harness);
  });
  afterEach(() => harness.close());
}
