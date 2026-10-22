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

describe("EvidenceUpload (demo)", () => {
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

  it("walks the whole wizard without any network request and never claims an upload", async () => {
    const user = userEvent.setup();
    render(<EvidenceUpload />);

    await fillStepOne(user);
    await user.click(screen.getByRole("button", { name: "Next" }));

    // Step 2: IPFS notice, CID placeholder, Next blocked until a file is hashed.
    expect(screen.getByText("IPFS upload is disabled in this demo (it requires a server-side proxy).")).toBeTruthy();
    expect(screen.getByText("Not uploaded (demo)")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next" }).disabled).toBe(true);

    await chooseFile(makeFile("abc", "abc.txt"));
    await waitFor(() => expect(screen.getByText(ABC_SHA256)).toBeTruthy());
    expect(screen.getByRole("button", { name: "Next" }).disabled).toBe(false);

    await user.click(screen.getByRole("button", { name: "Next" }));

    // Step 3 summary uses the local hash and the placeholder CID.
    expect(screen.getByText("CASE-TEST-1")).toBeTruthy();
    expect(screen.getByText(ABC_SHA256)).toBeTruthy();
    expect(screen.getByText("Not uploaded (demo)")).toBeTruthy();
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
