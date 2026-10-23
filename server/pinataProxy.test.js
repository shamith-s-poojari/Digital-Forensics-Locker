import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { handlePinRequest, MAX_UPLOAD_BYTES, resolvePinataJwt } from "./pinataProxy.js";

const SECRET = "test-jwt-secret-value";

function makeReq({ method = "POST", headers = {}, body = Buffer.from("--b\r\nfile\r\n--b--") } = {}) {
  const req = Readable.from([body]);
  req.method = method;
  req.headers = {
    host: "localhost:5173",
    "content-type": "multipart/form-data; boundary=b",
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
    expect(init.headers["Content-Type"]).toMatch(/^multipart\/form-data; boundary=b/);
    expect(res.body).not.toContain(SECRET);
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
