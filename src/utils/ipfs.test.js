import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadToIPFS } from "./ipfs";

const file = () => new File(["abc"], "abc.txt", { type: "text/plain" });

describe("uploadToIPFS", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the CID from the proxy and sends the file to /api/pin without credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ cid: "QmOk" }) });
    vi.stubGlobal("fetch", fetchMock);

    await expect(uploadToIPFS(file())).resolves.toBe("QmOk");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/pin");
    expect(init.headers.Authorization).toBeUndefined();
    expect(init.headers["Content-Type"]).toBeUndefined(); // the browser must add the multipart boundary
    expect(init.headers["X-Requested-With"]).toBe("forensics-locker");
    expect(init.body.get("file").name).toBe("abc.txt");
  });

  it("throws the server's error message on a non-OK response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 413, json: async () => ({ error: "File too large." }) })
    );
    await expect(uploadToIPFS(file())).rejects.toThrow("File too large.");
  });

  it("falls back to a status message when the error body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error("not json");
        },
      })
    );
    await expect(uploadToIPFS(file())).rejects.toThrow("HTTP 500");
  });

  it("explains a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(uploadToIPFS(file())).rejects.toThrow(/could not reach the upload server/i);
  });

  it("reports a timeout in plain words", async () => {
    const err = Object.assign(new Error("timeout"), { name: "TimeoutError" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(err));
    await expect(uploadToIPFS(file())).rejects.toThrow(/timed out/i);
  });

  it("rethrows the abort when the caller cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const abortErr = Object.assign(new Error("aborted"), { name: "AbortError" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortErr));
    await expect(uploadToIPFS(file(), { signal: controller.signal })).rejects.toBe(abortErr);
  });

  it("rejects when the proxy answers OK without a CID", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }));
    await expect(uploadToIPFS(file())).rejects.toThrow(/no CID/i);
  });
});
