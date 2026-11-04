// Postgres storage for the server stores, chosen when DATABASE_URL is set. Same operations as
// server/storage/fileStorage.js, which documents them. Migrations (server/storage/schema.js) run before the first query.

import pg from "pg";
import { MIGRATIONS } from "./schema.js";

const MIGRATION_LOCK = 7264011; // any fixed number: serialises servers starting at the same time

const iso = (date) => (date ? date.toISOString() : null);
// pg returns bigint as a string; branch ids are far below Number.MAX_SAFE_INTEGER (readRequestFields, the contract's count).
const branch = (value) => (value === null ? null : Number(value));

const toVersion = (row) => ({
  version: row.version,
  title: row.title,
  description: row.description,
  salt: row.salt,
  digest: row.digest,
  editedBy: row.edited_by,
  editedAt: iso(row.edited_at),
});

const toCase = (row, versions) => ({
  caseRef: row.case_ref,
  caseNumber: row.case_number,
  branchId: branch(row.branch_id),
  createdBy: row.created_by,
  createdAt: iso(row.created_at),
  versions,
});

const toRequest = (row) => ({
  id: row.id,
  address: row.address,
  role: row.role,
  branchId: branch(row.branch_id),
  reason: row.reason,
  status: row.status,
  createdAt: iso(row.created_at),
  resolvedBy: row.resolved_by,
  resolvedAt: iso(row.resolved_at),
});

const toKey = (row) => ({
  keyId: row.key_id,
  sha256: row.sha256,
  masterKeyVersion: row.master_key_version,
  iv: row.iv,
  wrapped: row.wrapped,
  tag: row.tag,
  createdBy: row.created_by,
  createdAt: iso(row.created_at),
});

const toRelease = (row) => ({ keyId: row.key_id, sha256: row.sha256, address: row.address, at: iso(row.at) });

const toNote = (row) => ({
  noteHash: row.note_hash,
  evidenceId: Number(row.evidence_id),
  branchId: branch(row.branch_id),
  note: row.note,
  salt: row.salt,
  author: row.author,
  createdAt: iso(row.created_at),
});

const INSERT_VERSION = `INSERT INTO case_versions (case_ref, version, title, description, salt, digest, edited_by, edited_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING`;
const versionParams = (caseRef, v) => [caseRef, v.version, v.title, v.description, v.salt, v.digest, v.editedBy, v.editedAt];

/** Inserts a case with all its versions. Run inside a transaction. Returns false if the case already exists. */
async function insertCase(client, entry) {
  const { rowCount } = await client.query(
    `INSERT INTO cases (case_ref, case_number, branch_id, created_by, created_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
    [entry.caseRef, entry.caseNumber, entry.branchId ?? null, entry.createdBy, entry.createdAt],
  );
  if (rowCount === 0) return false;
  for (const version of entry.versions) await client.query(INSERT_VERSION, versionParams(entry.caseRef, version));
  return true;
}

async function insertKey(db, e) {
  const { rowCount } = await db.query(
    `INSERT INTO evidence_keys (key_id, sha256, master_key_version, iv, wrapped, tag, created_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING`,
    [e.keyId, e.sha256, e.masterKeyVersion, e.iv, e.wrapped, e.tag, e.createdBy, e.createdAt],
  );
  return rowCount > 0;
}

async function insertRequest(db, r) {
  const { rowCount } = await db.query(
    `INSERT INTO access_requests (id, address, role, branch_id, reason, status, created_at, resolved_by, resolved_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (id) DO NOTHING`,
    [r.id, r.address, r.role, r.branchId, r.reason, r.status, r.createdAt, r.resolvedBy ?? null, r.resolvedAt ?? null],
  );
  return rowCount > 0;
}

const insertRelease = (db, r) => db.query(`INSERT INTO key_access_log (key_id, sha256, address, at) VALUES ($1, $2, $3, $4)`, [r.keyId, r.sha256, r.address, r.at]);

async function insertNote(db, n) {
  const { rowCount } = await db.query(
    `INSERT INTO custody_notes (note_hash, evidence_id, branch_id, note, salt, author, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
    [n.noteHash, n.evidenceId, n.branchId ?? null, n.note, n.salt, n.author, n.createdAt],
  );
  return rowCount > 0;
}

/**
 * @param {import("pg").PoolConfig} config  Usually just { connectionString }.
 */
export function createPostgresStorage(config) {
  const pool = new pg.Pool({ max: 5, ...config });
  // Free hosts drop idle connections. Without a listener, that error would crash the process.
  pool.on("error", (err) => console.error("[storage] idle database connection lost:", err.message));

  async function withTransaction(work) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  let migrating = null;
  function ready() {
    migrating ??= withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock($1)", [MIGRATION_LOCK]);
      await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
      const { rows } = await client.query("SELECT name FROM schema_migrations");
      const applied = new Set(rows.map((row) => row.name));
      for (const { name, sql } of MIGRATIONS) {
        if (applied.has(name)) continue;
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
      }
    }).catch((err) => {
      migrating = null; // the database may just be waking up: try again on the next request
      throw err;
    });
    return migrating;
  }

  const query = async (text, params) => {
    await ready();
    return pool.query(text, params);
  };
  const transaction = async (work) => {
    await ready();
    return withTransaction(work);
  };

  async function getCase(caseRef) {
    const { rows } = await query("SELECT * FROM cases WHERE case_ref = $1", [caseRef]);
    if (!rows[0]) return null;
    const versions = await query("SELECT * FROM case_versions WHERE case_ref = $1 ORDER BY version", [caseRef]);
    return toCase(rows[0], versions.rows.map(toVersion));
  }

  const cases = {
    async list() {
      const [all, versions] = await Promise.all([
        query("SELECT * FROM cases ORDER BY seq"),
        query("SELECT * FROM case_versions ORDER BY case_ref, version"),
      ]);
      const byCase = Map.groupBy(versions.rows, (row) => row.case_ref);
      // A case is committed with its first version, so a case read just after the versions were read has none here.
      return all.rows.filter((row) => byCase.has(row.case_ref)).map((row) => toCase(row, byCase.get(row.case_ref).map(toVersion)));
    },
    get: getCase,
    insert: (entry) => transaction((client) => insertCase(client, entry)),
    async appendVersion(caseRef, version) {
      // Two edits at once both choose the same next number: the primary key lets one through.
      const { rowCount } = await query(INSERT_VERSION, versionParams(caseRef, version));
      return rowCount === 0 ? null : getCase(caseRef);
    },
  };

  const accessRequests = {
    list: async () => (await query("SELECT * FROM access_requests ORDER BY seq")).rows.map(toRequest),
    listPending: async () => (await query("SELECT * FROM access_requests WHERE status = 'pending' ORDER BY seq")).rows.map(toRequest),
    async latestFor(address) {
      const { rows } = await query("SELECT * FROM access_requests WHERE lower(address) = lower($1) ORDER BY seq DESC LIMIT 1", [address]);
      return rows[0] ? toRequest(rows[0]) : null;
    },
    async get(id) {
      const { rows } = await query("SELECT * FROM access_requests WHERE id = $1", [id]);
      return rows[0] ? toRequest(rows[0]) : null;
    },
    replacePending: (request) =>
      transaction(async (client) => {
        // The lock makes a second request from the same wallet wait, then replace this one.
        await client.query("SELECT pg_advisory_xact_lock(hashtext(lower($1)))", [request.address]);
        await client.query("DELETE FROM access_requests WHERE lower(address) = lower($1) AND status = 'pending'", [request.address]);
        await insertRequest(client, request);
      }),
    async resolve(id, decision) {
      const { rows } = await query("UPDATE access_requests SET status = $2, resolved_by = $3, resolved_at = $4 WHERE id = $1 RETURNING *", [
        id,
        decision.status,
        decision.resolvedBy,
        decision.resolvedAt,
      ]);
      return toRequest(rows[0]);
    },
  };

  const keys = {
    list: async () => (await query("SELECT * FROM evidence_keys ORDER BY seq")).rows.map(toKey),
    async get(keyId) {
      const { rows } = await query("SELECT * FROM evidence_keys WHERE key_id = $1", [keyId]);
      return rows[0] ? toKey(rows[0]) : null;
    },
    insert: async (entry) => {
      await ready();
      return insertKey(pool, entry);
    },
    logRelease: async (row) => {
      await ready();
      await insertRelease(pool, row);
    },
    listReleases: async () => (await query("SELECT * FROM key_access_log ORDER BY seq")).rows.map(toRelease),
  };

  const custodyNotes = {
    list: async () => (await query("SELECT * FROM custody_notes ORDER BY seq")).rows.map(toNote),
    listFor: async (evidenceId) => (await query("SELECT * FROM custody_notes WHERE evidence_id = $1 ORDER BY seq", [evidenceId])).rows.map(toNote),
    insert: async (entry) => {
      await ready();
      return insertNote(pool, entry);
    },
  };

  /**
   * Copies another storage's records in, all or nothing. Safe to run again: existing cases, requests and keys are left
   * alone. Log lines have no identity to compare, so they are copied only into an empty log.
   */
  async function importFrom(source) {
    const [sourceCases, sourceRequests, sourceKeys, sourceReleases, sourceNotes] = await Promise.all([
      source.cases.list(),
      source.accessRequests.list(),
      source.keys.list(),
      source.keys.listReleases(),
      source.custodyNotes.list(),
    ]);
    return transaction(async (client) => {
      const count = async (items, insert) => {
        let copied = 0;
        for (const item of items) if (await insert(client, item)) copied += 1;
        return { copied, skipped: items.length - copied };
      };
      const result = {
        cases: await count(sourceCases, insertCase),
        accessRequests: await count(sourceRequests, insertRequest),
        keys: await count(sourceKeys, insertKey),
        custodyNotes: await count(sourceNotes, insertNote),
      };
      const { rows } = await client.query("SELECT EXISTS (SELECT 1 FROM key_access_log) AS used");
      if (rows[0].used) result.keyReleases = { copied: 0, skipped: sourceReleases.length };
      else {
        for (const row of sourceReleases) await insertRelease(client, row);
        result.keyReleases = { copied: sourceReleases.length, skipped: 0 };
      }
      return result;
    });
  }

  return { kind: "postgres", cases, accessRequests, keys, custodyNotes, ready, importFrom, close: () => pool.end() };
}
