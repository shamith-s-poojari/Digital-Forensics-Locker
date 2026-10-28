import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadToIPFS, uploadToIPFSWithProgress } from "./ipfs";

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

describe("uploadToIPFSWithProgress", () => {
  /** Minimal XMLHttpRequest stand-in that the test drives by hand. */
  class FakeXhr {
    static last;
    constructor() {
      FakeXhr.last = this;
      this.upload = {};
      this.headers = {};
      this.status = 0;
      this.responseText = "";
    }
    open(method, url) {
      this.method = method;
      this.url = url;
    }
    setRequestHeader(k, v) {
      this.headers[k] = v;
    }
    send(body) {
      this.body = body;
    }
    abort() {
      this.onabort?.();
    }
  }

  afterEach(() => vi.unstubAllGlobals());

  it("posts to /api/pin with the CSRF header, reports progress, and resolves with the CID", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const onProgress = vi.fn();
    const promise = uploadToIPFSWithProgress(file(), { onProgress });
    const xhr = FakeXhr.last;

    expect(xhr.method).toBe("POST");
    expect(xhr.url).toBe("/api/pin");
    expect(xhr.headers["X-Requested-With"]).toBe("forensics-locker");
    expect(xhr.headers.Authorization).toBeUndefined();
    expect(xhr.body.get("file").name).toBe("abc.txt");

    xhr.upload.onprogress({ lengthComputable: true, loaded: 50, total: 200 });
    xhr.upload.onprogress({ lengthComputable: true, loaded: 200, total: 200 });
    xhr.upload.onprogress({ lengthComputable: false, loaded: 1, total: 0 }); // ignored
    expect(onProgress.mock.calls.map((c) => c[0])).toEqual([25, 100]);

    xhr.status = 200;
    xhr.responseText = JSON.stringify({ cid: "QmDone" });
    xhr.onload();
    await expect(promise).resolves.toBe("QmDone");
  });

  it("rejects with the server's message on an error status", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const promise = uploadToIPFSWithProgress(file());
    const xhr = FakeXhr.last;
    xhr.status = 413;
    xhr.responseText = JSON.stringify({ error: "File too large." });
    xhr.onload();
    await expect(promise).rejects.toThrow("File too large.");
  });

  it("falls back to a status message when the body is not JSON", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const promise = uploadToIPFSWithProgress(file());
    FakeXhr.last.status = 502;
    FakeXhr.last.responseText = "<html>Bad gateway</html>";
    FakeXhr.last.onload();
    await expect(promise).rejects.toThrow("HTTP 502");
  });

  it("rejects when OK but no CID came back", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const promise = uploadToIPFSWithProgress(file());
    FakeXhr.last.status = 200;
    FakeXhr.last.responseText = "{}";
    FakeXhr.last.onload();
    await expect(promise).rejects.toThrow("HTTP 200");
  });

  it("explains network failures and timeouts", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const network = uploadToIPFSWithProgress(file());
    FakeXhr.last.onerror();
    await expect(network).rejects.toThrow(/could not reach the upload server/i);

    const timeout = uploadToIPFSWithProgress(file());
    FakeXhr.last.ontimeout();
    await expect(timeout).rejects.toThrow(/timed out/i);
  });

  it("can be cancelled with an AbortSignal", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const controller = new AbortController();
    const promise = uploadToIPFSWithProgress(file(), { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("does not start when the signal is already aborted", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const controller = new AbortController();
    controller.abort();
    await expect(uploadToIPFSWithProgress(file(), { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
});
