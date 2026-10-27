// The case store the app talks to (server/caseStore.js), behind this interface:
//
//   list()                                   -> Case[]
//   create({ caseNumber, title, description }, editor?) -> Case        (version 1)
//   addVersion(caseRef, { title, description }, editor?) -> Case       (appends; an unchanged edit adds nothing)
//   (editor: the acting address. The server ignores it and uses the signed-in session; test stores record it.)
//
//   Case    = { caseRef, caseNumber, createdBy, createdAt, versions: Version[] }   oldest version first
//   Version = { version, title, description, salt, digest, editedBy, editedAt }
//
// Needs a wallet sign-in. Tests use an in-memory store with the same interface (src/test/memoryCaseStore.js).

const HEADERS = { "X-Requested-With": "forensics-locker" };

async function call(path, init = {}) {
  let res;
  try {
    res = await fetch(path, { credentials: "same-origin", ...init, headers: { ...HEADERS, ...init.headers } });
  } catch (err) {
    throw new Error("Could not reach the case store. Is the server running?", { cause: err });
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body?.error || `Case store error (HTTP ${res.status}).`), { status: res.status });
  return body;
}

const postJson = (path, data) => call(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });

export const httpCaseStore = {
  kind: "server",
  list: async () => (await call("/api/cases")).cases ?? [],
  create: (fields) => postJson("/api/cases", fields),
  addVersion: (caseRef, fields) => postJson(`/api/cases/${caseRef}/versions`, fields),
};
