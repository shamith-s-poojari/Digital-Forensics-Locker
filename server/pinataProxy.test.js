import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { handlePinRequest, MAX_UPLOAD_BYTES, resolvePinataJwt } from "./pinataProxy.js";

const SECRET = "test-jwt-secret-value";
// Browser-style boundary. (undici mis-parses some bodies under a one-letter boundary such as "b".)
const BOUNDARY = "----WebKitFormBoundary7MA4YWxkTrZu0gW";

/** A minimal valid envelope: "DFLENC", version 1, AES-256-GCM, then zeroed header fields and 32 bytes of "ciphertext". */
function envelopeBytes() {
  const bytes = new Uint8Array(68 + 32);
  bytes.set(new TextEncoder().encode("DFLENC"), 0);
  bytes[6] = 1;
  bytes[7] = 1;
  return bytes;
}

/** Builds a browser-style multipart body. parts: [{ name, filename?, data }] */
function multipart(parts) {
  const chunks = [];
  for (const { name, filename, data } of parts) {
    const disposition = filename ? `form-data; name="${name}"; filename="${filename}"` : `form-data; name="${name}"`;
    const type = filename ? "\r\nContent-Type: application/octet-stream" : "";
    chunks.push(Buffer.from(`--${BOUNDARY}\r\nContent-Disposition: ${disposition}${type}\r\n\r\n`), Buffer.from(data), Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${BOUNDARY}--\r\n`));
  return Buffer.concat(chunks);
}

const encryptedBody = () => multipart([{ name: "file", filename: "evidence.bin.enc", data: envelopeBytes() }]);

function makeReq({ method = "POST", headers = {}, body = encryptedBody() } = {}) {
  const req = Readable.from([body]);
  req.method = method;
  req.headers = {
    host: "localhost:5173",
    "content-type": `multipart/form-data; boundary=${BOUNDARY}`,
    "x-requested-with": "forensics-locker",
    ...headers,
  };
  return req;
}

function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    headersSent: false,
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
    },
    end(chunk) {
      this.body = chunk ?? "";
    },
  };
}

const json = (res) => JSON.parse(res.body);

describe("handlePinRequest", () => {
  it("rejects non-POST requests", async () => {
    const res = makeRes();
    await handlePinRequest(makeReq({ method: "GET" }), res, { jwt: SECRET });
    expect(res.statusCode).toBe(405);
    expect(res.headers.allow).toBe("POST");
  });

  it("returns 503 with setup instructions when no JWT is configured", async () => {
    const res = makeRes();
    await handlePinRequest(makeReq(), res, {});
    expect(res.statusCode).toBe(503);
    expect(json(res).error).toMatch(/PINATA_JWT/);
  });

  it("rejects requests without the custom header (cross-site form post)", async () => {
    const fetchImpl = vi.fn();
    const res = makeRes();
    await handlePinRequest(makeReq({ headers: { "x-requested-with": undefined } }), res, { jwt: SECRET, fetchImpl });
    expect(res.statusCode).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses callers the authorize check rejects (no wallet sign-in) without contacting Pinata", async () => {
    const fetchImpl = vi.fn();
    const res = makeRes();
    await handlePinRequest(makeReq(), res, { jwt: SECRET, fetchImpl, authorize: () => false });
    expect(res.statusCode).toBe(401);
    expect(json(res).error).toMatch(/Sign in with your wallet/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses signed-in wallets whose on-chain role cannot upload, without contacting Pinata", async () => {
    const fetchImpl = vi.fn();
    const res = makeRes();
    const checkRole = async () => ({ status: 403, error: "Your wallet's role does not allow this. Required: Investigator." });
    await handlePinRequest(makeReq(), res, { jwt: SECRET, fetchImpl, authorize: () => true, checkRole });
    expect(res.statusCode).toBe(403);
    expect(json(res).error).toMatch(/Required: Investigator/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a foreign Origin", async () => {
    const fetchImpl = vi.fn();
    const res = makeRes();
    await handlePinRequest(makeReq({ headers: { origin: "https://evil.example" } }), res, { jwt: SECRET, fetchImpl });
    expect(res.statusCode).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("accepts a same-origin Origin", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ IpfsHash: "QmX" }) });
    const res = makeRes();
    await handlePinRequest(makeReq({ headers: { origin: "http://localhost:5173" } }), res, { jwt: SECRET, fetchImpl });
    expect(res.statusCode).toBe(200);
  });

  it("rejects non-multipart bodies", async () => {
    const res = makeRes();
    await handlePinRequest(makeReq({ headers: { "content-type": "application/json" } }), res, { jwt: SECRET });
    expect(res.statusCode).toBe(400);
  });

  it("rejects an oversized declared Content-Length without reading the body", async () => {
    const fetchImpl = vi.fn();
    const res = makeRes();
    await handlePinRequest(makeReq({ headers: { "content-length": String(MAX_UPLOAD_BYTES * 2) } }), res, {
      jwt: SECRET,
      fetchImpl,
    });
    expect(res.statusCode).toBe(413);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects an oversized body even when Content-Length lies", async () => {
    const fetchImpl = vi.fn();
    const res = makeRes();
    const big = Buffer.alloc(MAX_UPLOAD_BYTES + 128 * 1024);
    await handlePinRequest(makeReq({ body: big }), res, { jwt: SECRET, fetchImpl });
    expect(res.statusCode).toBe(413);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("forwards to Pinata with the server-side token and returns only the CID data", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ IpfsHash: "QmGood", PinSize: 3, Timestamp: "2026-01-01T00:00:00Z" }),
    });
    const res = makeRes();
    await handlePinRequest(makeReq(), res, { jwt: SECRET, fetchImpl });

    expect(res.statusCode).toBe(200);
    expect(json(res)).toEqual({ cid: "QmGood", size: 3, timestamp: "2026-01-01T00:00:00Z" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.pinata.cloud/pinning/pinFileToIPFS");
    expect(init.headers.Authorization).toBe(`Bearer ${SECRET}`);
    expect(init.headers["Content-Type"]).toBeUndefined(); // fetch sets it with the boundary of the rebuilt form
    expect([...init.body.keys()]).toEqual(["file"]);
    const forwarded = init.body.get("file");
    expect(forwarded.name).toBe("evidence.bin.enc");
    expect(new Uint8Array(await forwarded.arrayBuffer())).toEqual(envelopeBytes());
    expect(res.body).not.toContain(SECRET);
  });

  it("refuses a plaintext file without contacting Pinata", async () => {
    const fetchImpl = vi.fn();
    const res = makeRes();
    const plain = Buffer.from("not encrypted at all, just some plain bytes here".repeat(3));
    const body = multipart([{ name: "file", filename: "photo.jpg", data: plain }]);
    await handlePinRequest(makeReq({ body }), res, { jwt: SECRET, fetchImpl });
    expect(res.statusCode).toBe(400);
    expect(json(res).error).toMatch(/encrypted/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a header-only stub too short to hold ciphertext and a tag", async () => {
    const fetchImpl = vi.fn();
    const res = makeRes();
    const body = multipart([{ name: "file", filename: "x.enc", data: envelopeBytes().slice(0, 70) }]);
    await handlePinRequest(makeReq({ body }), res, { jwt: SECRET, fetchImpl });
    expect(res.statusCode).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses extra parts, so nothing can ride along next to an encrypted file", async () => {
    const fetchImpl = vi.fn();
    const res = makeRes();
    const body = multipart([
      { name: "file", filename: "evidence.enc", data: envelopeBytes() },
      { name: "file", filename: "secret.txt", data: Buffer.from("plaintext") },
    ]);
    await handlePinRequest(makeReq({ body }), res, { jwt: SECRET, fetchImpl });
    expect(res.statusCode).toBe(400);

    const res2 = makeRes();
    const body2 = multipart([
      { name: "file", filename: "evidence.enc", data: envelopeBytes() },
      { name: "pinataMetadata", data: '{"name":"Case 12 - suspect laptop"}' },
    ]);
    await handlePinRequest(makeReq({ body: body2 }), res2, { jwt: SECRET, fetchImpl });
    expect(res2.statusCode).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a malformed multipart body", async () => {
    const fetchImpl = vi.fn();
    const res = makeRes();
    await handlePinRequest(makeReq({ body: Buffer.from("garbage") }), res, { jwt: SECRET, fetchImpl });
    expect(res.statusCode).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("maps a Pinata 401 to a server-credentials error and never leaks the token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { reason: "INVALID_CREDENTIALS", details: `Bearer ${SECRET} is bad` } }),
    });
    const res = makeRes();
    await handlePinRequest(makeReq(), res, { jwt: SECRET, fetchImpl });
    expect(res.statusCode).toBe(502);
    expect(json(res).error).toMatch(/credentials/i);
    expect(res.body).not.toContain(SECRET);
  });

  it("passes through other Pinata errors", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: { details: "Rate limit exceeded" } }),
    });
    const res = makeRes();
    await handlePinRequest(makeReq(), res, { jwt: SECRET, fetchImpl });
    expect(res.statusCode).toBe(429);
    expect(json(res).error).toBe("Rate limit exceeded");
  });

  it("returns 504 on an upstream timeout and 502 when Pinata is unreachable", async () => {
    const timeout = Object.assign(new Error("t"), { name: "TimeoutError" });
    let res = makeRes();
    await handlePinRequest(makeReq(), res, { jwt: SECRET, fetchImpl: vi.fn().mockRejectedValue(timeout) });
    expect(res.statusCode).toBe(504);

    res = makeRes();
    await handlePinRequest(makeReq(), res, { jwt: SECRET, fetchImpl: vi.fn().mockRejectedValue(new TypeError("net")) });
    expect(res.statusCode).toBe(502);
  });

  it("returns 502 when Pinata answers OK but without a hash", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const res = makeRes();
    await handlePinRequest(makeReq(), res, { jwt: SECRET, fetchImpl });
    expect(res.statusCode).toBe(502);
  });
});

describe("resolvePinataJwt", () => {
  it("prefers PINATA_JWT", () => {
    expect(resolvePinataJwt({ PINATA_JWT: "a", VITE_PINATA_JWT: "b" })).toEqual({ jwt: "a", legacy: false });
  });
  it("falls back to the legacy VITE_ name and flags it", () => {
    expect(resolvePinataJwt({ VITE_PINATA_JWT: "b" })).toEqual({ jwt: "b", legacy: true });
  });
  it("returns nothing when neither is set", () => {
    expect(resolvePinataJwt({}).jwt).toBeUndefined();
  });
});
