// JSON-file storage for the server stores: the default for development and tests, and works offline. One process only.
// server/storage/postgresStorage.js implements the same operations; server/api.js picks one.
//
//   cases:          list() | get(caseRef) | insert(entry) -> false if taken | appendVersion(caseRef, version) -> Case | null
//   accessRequests: list() | listPending() | latestFor(address) | get(id) | replacePending(request) | resolve(id, decision) -> Request
//   keys:           list() | get(keyId) | insert(entry) -> false if taken | logRelease(row) | listReleases()
//   custodyNotes:   list() | listFor(evidenceId) | insert(entry) -> false if taken
//   rolePins:       get(address) -> entry | null | put(entry)   (address checksummed; replaces any previous entry)
//
// Lists are in the order things were added. Records handed out are copies: changing one changes nothing stored.

import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { sameAddress } from "../../src/web3/format.js";

const copy = (value) => (value === undefined || value === null ? null : structuredClone(value));

/** One JSON file holding one collection, loaded once and rewritten whole on every change. */
function jsonFile(filePath, field, decode, encode) {
  let loading = null;
  // Writes are chained so two changes at once cannot interleave and lose an entry.
  let writeChain = Promise.resolve();

  function load() {
    loading ??= readFile(filePath, "utf8")
      .then((text) => decode(JSON.parse(text)[field]))
      .catch((err) => {
        if (err?.code === "ENOENT") return decode(undefined);
        loading = null; // never replace an unreadable file with an empty store
        throw err;
      });
    return loading;
  }

  function persist(data) {
    const write = async () => {
      await mkdir(dirname(filePath), { recursive: true });
      const tmp = `${filePath}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify({ version: 1, [field]: encode(data) }, null, 2), { mode: 0o600 });
      await rename(tmp, filePath);
    };
    // A failed write must not make every later write fail too.
    writeChain = writeChain.then(write, write);
    return writeChain;
  }

  return { load, persist };
}

const asMap = (value) => new Map(Object.entries(value ?? {}));

function createFileCases(filePath) {
  const file = jsonFile(filePath, "cases", asMap, Object.fromEntries);
  return {
    list: async () => copy([...(await file.load()).values()]),
    get: async (caseRef) => copy((await file.load()).get(caseRef)),
    async insert(entry) {
      const map = await file.load();
      if (map.has(entry.caseRef)) return false;
      map.set(entry.caseRef, copy(entry));
      try {
        await file.persist(map);
      } catch (err) {
        map.delete(entry.caseRef);
        throw err;
      }
      return true;
    },
    async appendVersion(caseRef, version) {
      const map = await file.load();
      const entry = map.get(caseRef);
      if (entry.versions[entry.versions.length - 1].version + 1 !== version.version) return null;
      entry.versions.push(copy(version));
      try {
        await file.persist(map);
      } catch (err) {
        entry.versions.pop();
        throw err;
      }
      return copy(entry);
    },
  };
}

function createFileAccessRequests(filePath) {
  const file = jsonFile(filePath, "requests", (value) => value ?? [], (list) => list);
  return {
    list: async () => copy(await file.load()),
    listPending: async () => copy((await file.load()).filter((r) => r.status === "pending")),
    latestFor: async (address) => copy((await file.load()).findLast((r) => sameAddress(r.address, address))),
    get: async (id) => copy((await file.load()).find((r) => r.id === id)),
    async replacePending(request) {
      const list = await file.load();
      const previous = list.findIndex((r) => r.status === "pending" && sameAddress(r.address, request.address));
      const removed = previous >= 0 ? list.splice(previous, 1)[0] : null;
      list.push(copy(request));
      try {
        await file.persist(list);
      } catch (err) {
        list.pop();
        if (removed) list.splice(previous, 0, removed);
        throw err;
      }
    },
    async resolve(id, decision) {
      const list = await file.load();
      const request = list.find((r) => r.id === id);
      const before = { ...request };
      Object.assign(request, decision);
      try {
        await file.persist(list);
      } catch (err) {
        Object.assign(request, before);
        throw err;
      }
      return copy(request);
    },
  };
}

function createFileKeys(filePath, accessLogPath) {
  const file = jsonFile(filePath, "keys", asMap, Object.fromEntries);
  return {
    list: async () => copy([...(await file.load()).values()]),
    get: async (keyId) => copy((await file.load()).get(keyId)),
    async insert(entry) {
      const map = await file.load();
      if (map.has(entry.keyId)) return false; // an id can never be overwritten
      map.set(entry.keyId, copy(entry));
      try {
        await file.persist(map);
      } catch (err) {
        map.delete(entry.keyId);
        throw err;
      }
      return true;
    },
    async logRelease(row) {
      await mkdir(dirname(accessLogPath), { recursive: true });
      await appendFile(accessLogPath, `${JSON.stringify(row)}\n`, { mode: 0o600 });
    },
    async listReleases() {
      const text = await readFile(accessLogPath, "utf8").catch((err) => {
        if (err?.code === "ENOENT") return "";
        throw err;
      });
      return text.split("\n").filter(Boolean).map((line) => JSON.parse(line));
    },
  };
}

function createFileCustodyNotes(filePath) {
  const file = jsonFile(filePath, "notes", (value) => value ?? [], (list) => list);
  return {
    list: async () => copy(await file.load()),
    listFor: async (evidenceId) => copy((await file.load()).filter((n) => n.evidenceId === evidenceId)),
    async insert(entry) {
      const list = await file.load();
      if (list.some((n) => n.noteHash === entry.noteHash)) return false;
      list.push(copy(entry));
      try {
        await file.persist(list);
      } catch (err) {
        list.pop();
        throw err;
      }
      return true;
    },
  };
}

function createFileRolePins(filePath) {
  const file = jsonFile(filePath, "pins", asMap, Object.fromEntries);
  return {
    get: async (address) => copy((await file.load()).get(address)),
    async put(entry) {
      const map = await file.load();
      const previous = map.get(entry.address);
      map.set(entry.address, copy(entry));
      try {
        await file.persist(map);
      } catch (err) {
        if (previous) map.set(entry.address, previous);
        else map.delete(entry.address);
        throw err;
      }
    },
  };
}

/**
 * @param {object} paths
 * @param {string} paths.caseFile
 * @param {string} paths.accessRequestFile
 * @param {string} paths.keyFile
 * @param {string} paths.accessLogFile  JSON-lines; one line per key release.
 * @param {string} paths.custodyNoteFile
 * @param {string} [paths.rolePinFile]  Defaults to role-pins.json next to the case file.
 */
export function createFileStorage({ caseFile, accessRequestFile, keyFile, accessLogFile, custodyNoteFile, rolePinFile }) {
  return {
    kind: "file",
    cases: createFileCases(caseFile),
    accessRequests: createFileAccessRequests(accessRequestFile),
    keys: createFileKeys(keyFile, accessLogFile),
    custodyNotes: createFileCustodyNotes(custodyNoteFile),
    rolePins: createFileRolePins(rolePinFile ?? join(dirname(caseFile), "role-pins.json")),
    ready: async () => {},
    close: async () => {},
  };
}
