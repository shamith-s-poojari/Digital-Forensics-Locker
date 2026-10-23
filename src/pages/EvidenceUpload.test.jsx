// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EvidenceUpload from "./EvidenceUpload";

const ABC_SHA256 = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

/** Builds a File from text or bytes; adds Blob.arrayBuffer() if the jsdom version in use lacks it. */
function makeFile(content, name, type = "text/plain") {
  const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
  const file = new File([bytes], name, { type });
  if (typeof file.arrayBuffer !== "function") {
    file.arrayBuffer = async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }
  return file;
}

const fillStepOne = async (user) => {
  await user.type(screen.getByLabelText("Case ID"), "CASE-TEST-1");
  await user.type(screen.getByLabelText("Case Title"), "Test case");
  await user.selectOptions(screen.getByLabelText("Evidence Type"), "Document");
  await user.type(screen.getByLabelText("Description"), "A test description");
};

const chooseFile = async (file) => {
  // The real <input type="file"> is hidden and opened from the drop zone; drive it directly.
  fireEvent.change(document.getElementById("fileInput"), { target: { files: [file] } });
};

describe("EvidenceUpload", () => {
  let fetchSpy;

  beforeEach(() => {
    if (!globalThis.crypto?.subtle) vi.stubGlobal("crypto", webcrypto);
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("gives every form control a real label", () => {
    render(<EvidenceUpload />);
    for (const label of ["Case ID", "Case Title", "Evidence Type", "Description"]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });

  it("walks the whole wizard without any network request unless Upload is clicked, and never claims an upload", async () => {
    const user = userEvent.setup();
    render(<EvidenceUpload />);

    await fillStepOne(user);
    await user.click(screen.getByRole("button", { name: "Next" }));

    // Step 2: public-IPFS warning, CID placeholder, Next and Upload blocked until a file is hashed.
    expect(screen.getByRole("note").textContent).toMatch(/public/i);
    expect(screen.getByText("Not uploaded")).toBeTruthy();
    expect(screen.getByRole("button", { name: /upload to ipfs/i }).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Next" }).disabled).toBe(true);

    await chooseFile(makeFile("abc", "abc.txt"));
    await waitFor(() => expect(screen.getByText(ABC_SHA256)).toBeTruthy());
    expect(screen.getByRole("button", { name: "Next" }).disabled).toBe(false);

    await user.click(screen.getByRole("button", { name: "Next" }));

    // Step 3 summary uses the local hash and the placeholder CID.
    expect(screen.getByText("CASE-TEST-1")).toBeTruthy();
    expect(screen.getByText(ABC_SHA256)).toBeTruthy();
    expect(screen.getByText("Not uploaded")).toBeTruthy();
    expect(screen.queryByText(/submit to blockchain/i)).toBeNull();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("clears the hash when the file is removed, and blocks Next again", async () => {
    const user = userEvent.setup();
    render(<EvidenceUpload />);
    await user.click(screen.getByRole("button", { name: "Next" }));

    await chooseFile(makeFile("abc", "abc.txt"));
    await waitFor(() => expect(screen.getByText(ABC_SHA256)).toBeTruthy());

    await user.click(screen.getByRole("button", { name: /remove selected file abc\.txt/i }));

    expect(screen.queryByText(ABC_SHA256)).toBeNull();
    expect(screen.getByText(/awaiting file selection/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next" }).disabled).toBe(true);
  });

  it("replaces the hash when a different file is chosen", async () => {
    const user = userEvent.setup();
    render(<EvidenceUpload />);
    await user.click(screen.getByRole("button", { name: "Next" }));

    await chooseFile(makeFile("abc", "abc.txt"));
    await waitFor(() => expect(screen.getByText(ABC_SHA256)).toBeTruthy());

    await chooseFile(makeFile("", "empty.txt"));
    await waitFor(() =>
      expect(screen.getByText("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")).toBeTruthy()
    );
    expect(screen.queryByText(ABC_SHA256)).toBeNull();
  });

  it("rejects files over the size cap with a hashing-based message and no hash", async () => {
    const user = userEvent.setup();
    render(<EvidenceUpload />);
    await user.click(screen.getByRole("button", { name: "Next" }));

    await chooseFile(makeFile(new Uint8Array(10 * 1024 * 1024 + 1), "big.bin"));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/SHA-256/);
    expect(alert.textContent).toMatch(/10\.00 MB/);
    expect(screen.getByRole("button", { name: "Next" }).disabled).toBe(true);
  });

  it("shows an honest, dismissible dialog on submit that never auto-closes", async () => {
    const user = userEvent.setup();
    render(<EvidenceUpload />);
    await fillStepOne(user);
    await user.click(screen.getByRole("button", { name: "Next" }));
    await chooseFile(makeFile("abc", "abc.txt"));
    await waitFor(() => expect(screen.getByText(ABC_SHA256)).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Next" }));

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: /submit \(demo only\)/i }));

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();
    expect(screen.getByText("Demo only: nothing was uploaded or recorded.")).toBeTruthy();
    expect(screen.queryByText(/transaction submitted/i)).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Dismiss" }));

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByRole("dialog")).toBeTruthy();
    vi.useRealTimers();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("closes the dialog with Escape and starts a fresh wizard", async () => {
    const user = userEvent.setup();
    render(<EvidenceUpload />);
    await fillStepOne(user);
    await user.click(screen.getByRole("button", { name: "Next" }));
    await chooseFile(makeFile("abc", "abc.txt"));
    await waitFor(() => expect(screen.getByText(ABC_SHA256)).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: /submit \(demo only\)/i }));

    expect(screen.getByRole("dialog")).toBeTruthy();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByLabelText("Case ID").value).toBe("");
  });

  it("keeps focus inside the dialog when Tab is pressed", async () => {
    const user = userEvent.setup();
    render(<EvidenceUpload />);
    await user.click(screen.getByRole("button", { name: "Next" }));
    await chooseFile(makeFile("abc", "abc.txt"));
    await waitFor(() => expect(screen.getByText(ABC_SHA256)).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: /submit \(demo only\)/i }));

    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Dismiss" }));
  });
});

describe("EvidenceUpload: IPFS pinning through the proxy", () => {
  let fetchSpy;

  beforeEach(() => {
    if (!globalThis.crypto?.subtle) vi.stubGlobal("crypto", webcrypto);
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const goToStepTwoWithFile = async (user) => {
    await user.click(screen.getByRole("button", { name: "Next" }));
    await chooseFile(makeFile("abc", "abc.txt"));
    await waitFor(() => expect(screen.getByText(ABC_SHA256)).toBeTruthy());
  };

  it("posts the file to /api/pin (never to Pinata directly, never with a token) and shows the CID", async () => {
    fetchSpy.mockResolvedValue({ ok: true, status: 200, json: async () => ({ cid: "QmTestCid123" }) });
    const user = userEvent.setup();
    render(<EvidenceUpload />);
    await goToStepTwoWithFile(user);

    await user.click(screen.getByRole("button", { name: /upload to ipfs/i }));

    await waitFor(() => expect(screen.getByText("QmTestCid123")).toBeTruthy());
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/pin");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBeUndefined();
    expect(init.headers["X-Requested-With"]).toBe("forensics-locker");
    expect(init.body.get("file").name).toBe("abc.txt");
    expect(screen.getByRole("button", { name: /upload again/i })).toBeTruthy();
  });

  it("shows the server's error and no CID when the upload fails, and the wizard stays usable", async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: "IPFS upload is not configured on the server." }),
    });
    const user = userEvent.setup();
    render(<EvidenceUpload />);
    await goToStepTwoWithFile(user);

    await user.click(screen.getByRole("button", { name: /upload to ipfs/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/not configured/i);
    expect(screen.getByText("Not uploaded")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next" }).disabled).toBe(false);
  });

  it("forgets the CID when a different file is chosen", async () => {
    fetchSpy.mockResolvedValue({ ok: true, status: 200, json: async () => ({ cid: "QmOldCid" }) });
    const user = userEvent.setup();
    render(<EvidenceUpload />);
    await goToStepTwoWithFile(user);
    await user.click(screen.getByRole("button", { name: /upload to ipfs/i }));
    await waitFor(() => expect(screen.getByText("QmOldCid")).toBeTruthy());

    await chooseFile(makeFile("", "empty.txt"));
    await waitFor(() =>
      expect(screen.getByText("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")).toBeTruthy()
    );

    expect(screen.queryByText("QmOldCid")).toBeNull();
    expect(screen.getByText("Not uploaded")).toBeTruthy();
  });

  it("says the file was pinned publicly in the final dialog, not that nothing was uploaded", async () => {
    fetchSpy.mockResolvedValue({ ok: true, status: 200, json: async () => ({ cid: "QmPinned" }) });
    const user = userEvent.setup();
    render(<EvidenceUpload />);
    await goToStepTwoWithFile(user);
    await user.click(screen.getByRole("button", { name: /upload to ipfs/i }));
    await waitFor(() => expect(screen.getByText("QmPinned")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: /submit \(demo only\)/i }));

    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toMatch(/pinned to public IPFS/);
    expect(dialog.textContent).toMatch(/QmPinned/);
    expect(dialog.textContent).not.toMatch(/nothing was uploaded/i);
  });
});
