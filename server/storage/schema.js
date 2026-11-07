// The Postgres schema, as ordered migrations (applied once each by server/storage/postgresStorage.js). Never edit an
// applied migration: add a new one. Kept in JavaScript, not .sql files, so it also works when Vite bundles the server
// code into its config.
//
// Case versions, wrapped keys, the key-release log and custody notes are append-only, enforced by triggers: the promise "no endpoint
// edits or deletes" then also holds against a bug or a stray query. A database owner can still disable a trigger, so
// this guards against mistakes and a compromised app query, not against someone holding the owner's password.

export const MIGRATIONS = [
  {
    name: "001_initial",
    sql: `
      CREATE FUNCTION refuse_change() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
      END
      $$;

      CREATE TABLE cases (
        case_ref    text PRIMARY KEY,
        case_number text NOT NULL,
        branch_id   bigint,
        created_by  text NOT NULL,
        created_at  timestamptz NOT NULL,
        seq         bigint GENERATED ALWAYS AS IDENTITY
      );

      CREATE TABLE case_versions (
        case_ref    text NOT NULL REFERENCES cases (case_ref),
        version     integer NOT NULL,
        title       text NOT NULL,
        description text NOT NULL,
        salt        text NOT NULL,
        digest      text NOT NULL,
        edited_by   text NOT NULL,
        edited_at   timestamptz NOT NULL,
        PRIMARY KEY (case_ref, version)
      );

      CREATE TABLE access_requests (
        id          text PRIMARY KEY,
        address     text NOT NULL,
        role        text NOT NULL,
        branch_id   bigint NOT NULL,
        reason      text NOT NULL,
        status      text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
        created_at  timestamptz NOT NULL,
        resolved_by text,
        resolved_at timestamptz,
        seq         bigint GENERATED ALWAYS AS IDENTITY
      );
      -- One pending request per wallet: a new request replaces the old one.
      CREATE UNIQUE INDEX access_requests_one_pending ON access_requests (lower(address)) WHERE status = 'pending';
      CREATE INDEX access_requests_by_address ON access_requests (lower(address), seq);

      CREATE TABLE evidence_keys (
        key_id             text PRIMARY KEY,
        sha256             text NOT NULL,
        master_key_version integer NOT NULL,
        iv                 text NOT NULL,
        wrapped            text NOT NULL,
        tag                text NOT NULL,
        created_by         text NOT NULL,
        created_at         timestamptz NOT NULL,
        seq                bigint GENERATED ALWAYS AS IDENTITY
      );

      -- No foreign key to evidence_keys: the record of who took a key must outlive anything that happens to the key.
      CREATE TABLE key_access_log (
        seq     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        key_id  text NOT NULL,
        sha256  text NOT NULL,
        address text NOT NULL,
        at      timestamptz NOT NULL
      );
      CREATE INDEX key_access_log_by_key ON key_access_log (key_id);
      CREATE INDEX key_access_log_by_address ON key_access_log (lower(address));

      CREATE TRIGGER case_versions_append_only BEFORE UPDATE OR DELETE ON case_versions
        FOR EACH ROW EXECUTE FUNCTION refuse_change();
      CREATE TRIGGER case_versions_no_truncate BEFORE TRUNCATE ON case_versions
        FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
      CREATE TRIGGER evidence_keys_append_only BEFORE UPDATE OR DELETE ON evidence_keys
        FOR EACH ROW EXECUTE FUNCTION refuse_change();
      CREATE TRIGGER evidence_keys_no_truncate BEFORE TRUNCATE ON evidence_keys
        FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
      CREATE TRIGGER key_access_log_append_only BEFORE UPDATE OR DELETE ON key_access_log
        FOR EACH ROW EXECUTE FUNCTION refuse_change();
      CREATE TRIGGER key_access_log_no_truncate BEFORE TRUNCATE ON key_access_log
        FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
    `,
  },
  {
    name: "002_custody_notes",
    sql: `
      -- The text behind the noteHash of a custody entry on chain. No foreign key: evidence records live on the chain.
      -- A row whose hash never reaches the chain (a rejected transaction) is harmless: nothing shows it.
      CREATE TABLE custody_notes (
        note_hash   text PRIMARY KEY,
        evidence_id bigint NOT NULL,
        branch_id   bigint,
        note        text NOT NULL,
        salt        text NOT NULL,
        author      text NOT NULL,
        created_at  timestamptz NOT NULL,
        seq         bigint GENERATED ALWAYS AS IDENTITY
      );
      CREATE INDEX custody_notes_by_evidence ON custody_notes (evidence_id, seq);

      CREATE TRIGGER custody_notes_append_only BEFORE UPDATE OR DELETE ON custody_notes
        FOR EACH ROW EXECUTE FUNCTION refuse_change();
      CREATE TRIGGER custody_notes_no_truncate BEFORE TRUNCATE ON custody_notes
        FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
    `,
  },
  {
    name: "003_role_pins",
    sql: `
      -- Salted scrypt hash of each account's sign-in PIN (server/rolePins.js). Never the PIN itself.
      CREATE TABLE role_pins (
        address    text PRIMARY KEY,
        salt       text NOT NULL,
        hash       text NOT NULL,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL
      );
    `,
  },
];
