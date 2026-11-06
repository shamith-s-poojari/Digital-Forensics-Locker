// End-to-end check of the evidence flow: the real contract, the frontend's EthersLedger, the browser crypto, the key
// store and the verification engine, with only IPFS replaced by an in-memory map. Covers the honest path (upload,
// register, fetch, decrypt, rehash, match) and the tamper cases the app must catch.
import { expect } from "chai";
import { network } from "hardhat";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
// @ts-expect-error plain JS
import { createEthersLedger } from "../../src/web3/ethersLedger.js";
// @ts-expect-error plain JS
import { encryptEvidence, sha256Hex } from "../../src/crypto/evidenceCrypto.js";
// @ts-expect-error plain JS
import { createKeyStore } from "../../server/keyStore.js";

const { ethers } = await network.connect();
const abi = JSON.parse(readFileSync(fileURLToPath(new URL("../../src/web3/EvidenceLocker.abi.json", import.meta.url)), "utf8"));
// Loaded in before(): verifyEvidence.js uses an extensionless import, so a load failure is reported clearly there.
let verifyStoredCopy: any, openAndHash: any;

const HOST = "localhost:5173";
function makeReq(method: string, url: string, address: string, body?: object) {
  const req: any = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  req.method = method;
  req.url = url;
  req.headers = { host: HOST, origin: `http://${HOST}`, "x-requested-with": "forensics-locker" };
  req.address = address;
  return req;
}
function makeRes() {
  return { statusCode: 200, body: "", setHeader() {}, end(c?: string) { this.body = c ?? ""; } } as any;
}

describe("E2E: upload -> register -> fetch -> decrypt -> rehash -> verify", () => {
  let ctx: any;

  before(async () => {
    try {
      ({ verifyStoredCopy, openAndHash } = await import("../../src/verify/verifyEvidence.js" as string));
    } catch (err) {
      throw new Error(`could not load verifyEvidence.js in Node: ${(err as Error).message}`);
    }
  });

  beforeEach(async () => {
    const [chief, alice, bob, carol, mallory] = await ethers.getSigners();
    const locker = await ethers.deployContract("EvidenceLocker", [3 * 24 * 60 * 60, chief.address]);
    const address = await locker.getAddress();
    await locker.createBranch("Central Lab");
    await locker.grantBranchRole(await locker.INVESTIGATOR_ROLE(), alice.address, 1);
    await locker.grantBranchRole(await locker.INVESTIGATOR_ROLE(), bob.address, 1);
    await locker.grantBranchRole(await locker.AUDITOR_ROLE(), carol.address, 1);
    const signers: any = { chief, alice, bob, carol, mallory };
    const as = (n: string) => createEthersLedger({ provider: ethers.provider, getSigner: async () => signers[n], address, abi, deployBlock: 0 });

    const rows = new Map<string, any>();
    const releases: any[] = [];
    const keyStore = createKeyStore({
      masterKey: randomBytes(32),
      storage: {
        insert: async (e: any) => (rows.has(e.keyId) ? false : (rows.set(e.keyId, e), true)),
        get: async (id: string) => rows.get(id) ?? null,
        logRelease: async (r: any) => void releases.push(r),
      },
      getSession: (req: any) => ({ address: req.address }),
    });
    const keyCall = async (method: string, url: string, who: string, body?: object) => {
      const res = makeRes();
      await keyStore.handle(makeReq(method, url, signers[who].address, body), res);
      return { status: res.statusCode, json: res.body ? JSON.parse(res.body) : null };
    };
    const keyClientFor = (who: string) => ({
      fetchKey: async (keyId: string) => {
        const r = await keyCall("GET", `/api/keys/${keyId}`, who);
        if (r.status !== 200) throw new Error(r.json?.error);
        return r.json;
      },
    });

    const ipfs = new Map<string, Uint8Array>();
    const fetchImpl = async (url: string) => {
      const cid = url.split("/ipfs/")[1];
      const bytes = ipfs.get(cid);
      return bytes ? new Response(bytes) : new Response("not found", { status: 404 });
    };
    ctx = { as, signers, keyCall, keyClientFor, ipfs, fetchImpl, releases };
  });

  /** The upload wizard's steps, in order. */
  async function upload(original: Uint8Array, caseLabel = "case-1") {
    const sha256 = await sha256Hex(original); // 1. hash the ORIGINAL in the browser
    const { envelope, keyId, key } = await encryptEvidence(original, sha256); // 2. encrypt
    const stored = await ctx.keyCall("POST", "/api/keys", "alice", { keyId, sha256, key }); // 3. key to key store
    expect(stored.status, JSON.stringify(stored.json)).to.equal(201);
    const cid = "bafy" + Buffer.from(randomBytes(28)).toString("hex").slice(0, 55); // 4. "pin" (59 chars)
    ctx.ipfs.set(cid, envelope);
    const caseRef = ethers.id(caseLabel);
    const handle = await ctx.as("alice").registerEvidence({ caseRef, sha256, cid, caseDigest: "d1".repeat(32) }); // 5. register
    const receipt = await handle.wait();
    return { sha256, cid, keyId, caseRef, id: receipt.evidenceId as number };
  }

  const verifyAs = (who: string, record: { id: number; cid: string }) =>
    verifyStoredCopy({
      record,
      ledger: ctx.as(who),
      gateways: ["https://gw.test/ipfs/"],
      ensureSession: async () => ({ ok: true }),
      keyClient: ctx.keyClientFor(who),
      fetchImpl: ctx.fetchImpl,
    });

  it("honest path: stored copy decrypts, rehashes to the registered hash, and logs VerifiedMatch", async () => {
    const original = new TextEncoder().encode("Disk image fragment #42\n" + "x".repeat(5000));
    const up = await upload(original);

    const rec = await ctx.as("carol").getEvidence(up.id);
    expect(rec.sha256).to.equal(up.sha256);
    expect(rec.cid).to.equal(up.cid);
    expect(rec.custody.map((c: any) => c.action)).to.deep.equal(["Submitted"]);

    const result = await verifyAs("carol", { id: up.id, cid: up.cid }); // auditor, read-only
    expect(result.encrypted).to.equal(true);
    expect(result.sha256).to.equal(up.sha256);
    expect(result.matches).to.equal(true);
    expect(Buffer.from(result.plaintext).equals(Buffer.from(original))).to.equal(true);
    expect(ctx.releases.length).to.equal(1); // key release was logged

    await (await ctx.as("bob").logVerification(up.id, result.sha256)).wait();
    const after = await ctx.as("carol").getEvidence(up.id);
    expect(after.custody.map((c: any) => c.action)).to.deep.equal(["Submitted", "VerifiedMatch"]);
    expect(await ctx.as("carol").verifyChain(up.id)).to.equal(true);
  });

  it("tampered file in hand (1 byte changed): rehash differs, verify=false, logs VerifiedMismatch", async () => {
    const original = new TextEncoder().encode("Witness statement v1");
    const up = await upload(original);
    const tampered = Uint8Array.from(original);
    tampered[0] ^= 0x01;
    const opened = await openAndHash(tampered, { ensureSession: async () => ({ ok: true }), keyClient: ctx.keyClientFor("bob") });
    expect(opened.encrypted).to.equal(false);
    expect(opened.sha256).to.not.equal(up.sha256);
    expect(await ctx.as("carol").verifyHash(up.id, opened.sha256)).to.equal(false);
    await (await ctx.as("bob").logVerification(up.id, opened.sha256)).wait();
    const after = await ctx.as("carol").getEvidence(up.id);
    expect(after.custody.at(-1).action).to.equal("VerifiedMismatch");
    expect(await ctx.as("carol").verifyChain(up.id)).to.equal(true);
  });

  it("tampered encrypted copy on storage (ciphertext byte flipped): decryption refuses", async () => {
    const up = await upload(new TextEncoder().encode("CCTV export"));
    const env = Uint8Array.from(ctx.ipfs.get(up.cid));
    env[env.length - 20] ^= 0xff;
    ctx.ipfs.set(up.cid, env);
    let msg = "";
    try { await verifyAs("carol", up); } catch (e) { msg = (e as Error).message; }
    expect(msg).to.match(/Decryption failed/);
  });

  it("tampered envelope header (claimed hash rewritten): decryption refuses", async () => {
    const up = await upload(new TextEncoder().encode("Phone dump"));
    const env = Uint8Array.from(ctx.ipfs.get(up.cid));
    env[40] ^= 0xff; // inside the header's sha256 field (bytes 36..67)
    ctx.ipfs.set(up.cid, env);
    let msg = "";
    try { await verifyAs("carol", up); } catch (e) { msg = (e as Error).message; }
    expect(msg).to.match(/Decryption failed/);
  });

  it("stored copy swapped for a different, validly encrypted file: decrypts but verify=false", async () => {
    const up = await upload(new TextEncoder().encode("Original ledger.xlsx bytes"));
    const forged = new TextEncoder().encode("Forged ledger.xlsx bytes");
    const fsha = await sha256Hex(forged);
    const { envelope, keyId, key } = await encryptEvidence(forged, fsha);
    expect((await ctx.keyCall("POST", "/api/keys", "alice", { keyId, sha256: fsha, key })).status).to.equal(201);
    ctx.ipfs.set(up.cid, envelope);
    const result = await verifyAs("carol", up);
    expect(result.encrypted).to.equal(true);
    expect(result.matches).to.equal(false);
  });

  it("guards: duplicate registration rejected, non-investigator cannot register or log", async () => {
    const original = new TextEncoder().encode("same bytes");
    const up = await upload(original, "case-dup");
    expect(await ctx.as("carol").findEvidence(up.caseRef, up.sha256)).to.equal(up.id);
    let dup = "";
    try { await (await ctx.as("bob").registerEvidence({ caseRef: up.caseRef, sha256: up.sha256, cid: up.cid, caseDigest: "d1".repeat(32) })).wait(); } catch (e: any) { dup = e.code ?? e.message; }
    expect(dup).to.not.equal("");
    for (const who of ["carol", "mallory"]) {
      let code = "";
      try { await (await ctx.as(who).logVerification(up.id, up.sha256)).wait(); } catch (e: any) { code = e.code ?? e.message; }
      expect(code, who).to.not.equal("");
    }
    // stored copy still verifies after all the rejected attempts
    expect((await verifyAs("carol", up)).matches).to.equal(true);
  });
});
