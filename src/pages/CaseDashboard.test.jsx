// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { WalletContext } from "../context/walletContext.js";
import { LedgerContext } from "../web3/ledgerContext.js";
import { RoleTestProvider } from "../test/RoleTestProvider.jsx";
import { ACCOUNT, makeFile, OTHER_INVESTIGATOR, renderWithDemo, SHA256_ABC } from "../test/demoHarness.jsx";
import { groupByCase } from "../web3/caseModel.js";
import { createDemoLedger, createDemoStore } from "../web3/demoLedger.js";
import { deriveCaseRef } from "../web3/format.js";
import { downloadJson } from "../utils/download";
import RolePreviewer from "../components/RolePreviewer";
import CaseDashboard from "./CaseDashboard";

vi.mock("../utils/download", () => ({
  downloadJson: vi.fn(),
  safeFileName: (value) => String(value).replace(/[^A-Za-z0-9_-]+/g, "_"),
}));

beforeEach(() => {
  if (!globalThis.crypto?.subtle) vi.stubGlobal("crypto", webcrypto);
  downloadJson.mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const seeded = () => createDemoStore();
const loaded = () => screen.findByRole("heading", { name: /Evidence · / });
const caseButtons = () => within(screen.getByRole("heading", { name: "Cases" }).closest("section")).getAllByRole("button");

describe("CaseDashboard: reading the ledger", () => {
  it("summarises the ledger and lists the evidence of the selected case with its hash and CID", async () => {
    const store = seeded();
    renderWithDemo(<CaseDashboard />, { store });
    await loaded();

    const kpi = (label) => screen.getByText(label).closest("div");
    expect(within(kpi("Evidence items")).getByText("9")).toBeTruthy();
    expect(within(kpi("Evidence items")).getByText("4 cases")).toBeTruthy();

    // The first (most recently active) case is selected and its items are in the table with copyable CIDs.
    const first = groupByCase(store.evidence)[0];
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(first.evidence.length + 1);
    for (const ev of first.evidence) {
      expect(within(table).getByRole("button", { name: `Copy CID of evidence ${ev.id}` })).toBeTruthy();
      expect(within(table).getByRole("button", { name: `Copy SHA-256 of evidence ${ev.id}` })).toBeTruthy();
    }
  });

  it("groups evidence into cases", async () => {
    renderWithDemo(<CaseDashboard />, { store: seeded() });
    await loaded();
    expect(caseButtons()).toHaveLength(4);
    expect(screen.getByRole("button", { name: /CASE-2025-0051/ })).toBeTruthy();
  });

  it("shows another case's evidence and its custody timeline when selected", async () => {
    renderWithDemo(<CaseDashboard />, { store: seeded() });
    await loaded();

    await userEvent.click(screen.getByRole("button", { name: /CASE-2025-0029/ }));
    expect(screen.getByRole("heading", { name: /Evidence · CASE-2025-0029/ })).toBeTruthy();
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(2); // header + 1 item
    expect(screen.getByRole("heading", { name: /Chain of custody · #7/ })).toBeTruthy();
  });

  it("flags a hash mismatch in the case list, the table and the KPI", async () => {
    renderWithDemo(<CaseDashboard />, { store: seeded() });
    await loaded();

    expect(within(screen.getByText("Hash mismatches").closest("div")).getByText("1")).toBeTruthy();
    const flaggedCase = screen.getByRole("button", { name: /CASE-2025-0051/ });
    expect(within(flaggedCase).getByText(/hash mismatch/)).toBeTruthy();

    await userEvent.click(flaggedCase);
    expect(within(screen.getByRole("table")).getByText("Hash MISMATCH")).toBeTruthy();
  });

  it("narrows the cases by a pasted CID", async () => {
    const store = seeded();
    renderWithDemo(<CaseDashboard />, { store });
    await loaded();

    const target = store.evidence.find((e) => e.id === 7);
    await userEvent.type(screen.getByLabelText(/Search cases/), target.cid);
    expect(caseButtons()).toHaveLength(1);
    expect(caseButtons()[0].textContent).toMatch(/CASE-2025-0029/);

    await userEvent.clear(screen.getByLabelText(/Search cases/));
    await userEvent.type(screen.getByLabelText(/Search cases/), "no such thing");
    expect(screen.getByText("No case matches that search.")).toBeTruthy();
  });

  it("shows the custody timeline newest first, and the ledger's hash-chain check", async () => {
    renderWithDemo(<CaseDashboard />, { store: seeded() });
    await loaded();

    const timeline = screen.getByRole("list", { name: /Custody events, newest first/ });
    const entries = within(timeline).getAllByRole("listitem");
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(within(entries.at(-1)).getByText("Registered")).toBeTruthy(); // the oldest event is at the bottom
    expect(await screen.findByText("Hash chain intact")).toBeTruthy();
  });

  it("warns when the stored custody trail no longer matches its head", async () => {
    const store = seeded();
    renderWithDemo(<CaseDashboard />, { store });
    await loaded();
    const shown = Number(screen.getByRole("heading", { name: /Chain of custody · #/ }).textContent.match(/#(\d+)/)[1]);

    // Tamper with the demo store directly, as an attacker with database access might.
    store.evidence.find((e) => e.id === shown).custody[0].actor = "0x0000000000000000000000000000000000000bad";
    fireEvent.click(screen.getByRole("button", { name: "Refresh from the ledger" }));
    expect(await screen.findByText(/HASH CHAIN BROKEN/)).toBeTruthy();
  });

  it("explains an empty ledger and offers registration only to investigators", async () => {
    renderWithDemo(<CaseDashboard />, { store: createDemoStore({ seed: false }) });
    expect(await screen.findByText("No evidence on the ledger yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Register the first evidence item" }).getAttribute("href")).toBe("/upload");
    cleanup();

    renderWithDemo(<CaseDashboard />, { store: createDemoStore({ seed: false }), role: "auditor" });
    expect(await screen.findByText("No evidence on the ledger yet")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Register/ })).toBeNull();
  });

  it("shows a paused banner and disables writes while the ledger is paused", async () => {
    const store = seeded();
    store.paused = true;
    renderWithDemo(<CaseDashboard />, { store });
    await loaded();

    expect(screen.getByRole("alert").textContent).toMatch(/paused the ledger/i);
    expect(screen.getByRole("button", { name: "Log that I accessed this" }).disabled).toBe(true);
  });

  it("reports a ledger read failure with a retry", async () => {
    const ledger = createDemoLedger({ store: seeded(), account: ACCOUNT, signDelayMs: 0, confirmDelayMs: 0 });
    const broken = { ...ledger, listEvidence: vi.fn().mockRejectedValue(Object.assign(new Error("x"), { code: "NETWORK_ERROR" })) };
    const config = { address: null, chainId: 1, chainName: "Test", explorerUrl: "", configured: false, deployBlock: 0, invalidAddress: false };
    render(
      <MemoryRouter>
        <WalletContext.Provider value={{ account: ACCOUNT, chainId: 1, connect() {}, disconnect() {}, switchChain: async () => true, error: null, isConnecting: false, clearError() {} }}>
          <LedgerContext.Provider value={{ mode: "chain", ledger: broken, config }}>
            <RoleTestProvider roles={{ isAuditor: true }}>
              <CaseDashboard />
            </RoleTestProvider>
          </LedgerContext.Provider>
        </WalletContext.Provider>
      </MemoryRouter>
    );
    const alert = await screen.findByText("Could not read the ledger.");
    expect(alert.closest("[role=alert]").textContent).toMatch(/could not reach the blockchain network/i);
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});

describe("CaseDashboard: what each role can do", () => {
  it("lets an Investigator log access, register and (as custodian) transfer", async () => {
    const store = seeded();
    renderWithDemo(<CaseDashboard />, { store });
    await loaded();

    expect(screen.getByRole("button", { name: "Log that I accessed this" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Register evidence" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Reassign custody/ })).toBeNull(); // admin only
  });

  it("gives an Auditor read-only access: they can check a file but see no write controls", async () => {
    renderWithDemo(<CaseDashboard />, { store: seeded(), role: "auditor" });
    await loaded();

    expect(screen.getByLabelText("Check a file against the ledger")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Log that I accessed this" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Transfer custody/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Register evidence/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Reassign custody/ })).toBeNull();
    expect(within(screen.getByText("Your access").closest("div")).getByText("read-only")).toBeTruthy();
  });

  it("gives the Chief recovery powers but no evidence-writing buttons", async () => {
    renderWithDemo(<CaseDashboard />, { store: seeded(), role: "admin" });
    await loaded();

    expect(screen.getByRole("button", { name: /Reassign custody \(Chief\)/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Log that I accessed this" })).toBeNull();
    expect(screen.queryByRole("link", { name: /Register evidence/ })).toBeNull();
  });

  it("updates the interface live when the role previewer changes the role (demo only)", async () => {
    renderWithDemo(
      <>
        <RolePreviewer />
        <CaseDashboard />
      </>,
      { store: seeded() }
    );
    await loaded();
    expect(screen.getByRole("button", { name: "Log that I accessed this" })).toBeTruthy();

    await userEvent.selectOptions(screen.getByLabelText(/view the app as/), "auditor");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Log that I accessed this" })).toBeNull());
    expect(screen.getByLabelText("Check a file against the ledger")).toBeTruthy();
  });
});

describe("CaseDashboard: writing to the ledger", () => {
  it("narrates a logged access from wallet approval to block inclusion, and shows the new timeline entry", async () => {
    const store = seeded();
    renderWithDemo(<CaseDashboard />, { store });
    await loaded();
    const before = store.evidence.reduce((n, e) => n + e.custody.length, 0);

    await userEvent.click(screen.getByRole("button", { name: "Log that I accessed this" }));

    const progress = await screen.findByLabelText("Log access");
    await waitFor(() => expect(within(progress).getByText(/Included in block/)).toBeTruthy());
    expect(within(progress).getByText("Approved in your wallet.")).toBeTruthy();
    expect(store.evidence.reduce((n, e) => n + e.custody.length, 0)).toBe(before + 1);

    // The timeline shows the new entry, attributed to the connected wallet.
    const timeline = screen.getByRole("list", { name: /Custody events, newest first/ });
    await waitFor(() => expect(within(within(timeline).getAllByRole("listitem")[0]).getByText("Accessed")).toBeTruthy());
    expect(within(within(timeline).getAllByRole("listitem")[0]).getByText("you")).toBeTruthy();
  });

  it("can be dismissed once finished", async () => {
    renderWithDemo(<CaseDashboard />, { store: seeded() });
    await loaded();
    await userEvent.click(screen.getByRole("button", { name: "Log that I accessed this" }));
    await screen.findByText(/Included in block/);
    await userEvent.click(screen.getByRole("button", { name: "Dismiss progress panel" }));
    expect(screen.queryByLabelText("Log access")).toBeNull();
  });

  it("explains a refused write in plain words, against the step that failed", async () => {
    const store = seeded();
    renderWithDemo(<CaseDashboard />, { store });
    await loaded();
    store.paused = true; // the Chief pauses between the page loading and the click

    await userEvent.click(screen.getByRole("button", { name: "Log that I accessed this" }));
    const progress = await screen.findByLabelText("Log access");
    await waitFor(() => expect(within(progress).getByText(/paused by the Chief/)).toBeTruthy());
    expect(progress.querySelector('[data-status="error"]')).toBeTruthy();
  });

  it("checks a file against the ledger without a transaction: a different file does not match", async () => {
    renderWithDemo(<CaseDashboard />, { store: seeded(), role: "auditor" });
    await loaded();

    fireEvent.change(screen.getByLabelText("Check a file against the ledger"), { target: { files: [makeFile("not the evidence", "other.txt")] } });
    expect(await screen.findByText(/does NOT match the hash registered/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Record this result on the ledger" })).toBeNull(); // auditors cannot write
  });

  it("reports a matching file, with a caveat, and lets an Investigator record the result on the ledger", async () => {
    const store = seeded();
    const ledger = createDemoLedger({ store, account: ACCOUNT, signDelayMs: 0, confirmDelayMs: 0 });
    store.setRole(ACCOUNT, "investigator");
    await (await ledger.registerEvidence({ caseRef: deriveCaseRef("CASE-NEW-1"), sha256: SHA256_ABC, cid: "bafynewcid" })).wait();
    renderWithDemo(<CaseDashboard />, { store });
    await loaded();

    await userEvent.click(await screen.findByRole("button", { name: /CASE-NEW-1|Case 0x/ }));
    fireEvent.change(screen.getByLabelText("Check a file against the ledger"), { target: { files: [makeFile("abc", "evidence.txt")] } });

    expect(await screen.findByText(/equals the hash registered on the ledger/)).toBeTruthy();
    expect(screen.getByText(/cannot show the evidence was genuine before registration/)).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Record this result on the ledger" }));
    await screen.findByText(/Included in block/);
    expect(store.evidence.at(-1).custody.at(-1).action).toBe("VerifiedMatch");
  });

  it("rejects a file that is too large to hash in the browser", async () => {
    renderWithDemo(<CaseDashboard />, { store: seeded(), role: "auditor" });
    await loaded();
    const big = makeFile("x", "big.bin");
    Object.defineProperty(big, "size", { value: 11 * 1024 * 1024 });
    fireEvent.change(screen.getByLabelText("Check a file against the ledger"), { target: { files: [big] } });
    expect((await screen.findByRole("alert")).textContent).toMatch(/limit for in-browser hashing/);
  });

  it("transfers custody only for the current custodian, to another investigator", async () => {
    const store = seeded();
    store.setRole(OTHER_INVESTIGATOR, "investigator");
    const ledger = createDemoLedger({ store, account: ACCOUNT, signDelayMs: 0, confirmDelayMs: 0 });
    store.setRole(ACCOUNT, "investigator");
    await (await ledger.registerEvidence({ caseRef: deriveCaseRef("CASE-MINE-1"), sha256: SHA256_ABC, cid: "bafymine" })).wait();

    renderWithDemo(<CaseDashboard />, { store });
    await loaded();

    // Someone else's evidence (a sample case): no transfer, with an explanation.
    await userEvent.click(screen.getByRole("button", { name: /CASE-2025-0029/ }));
    expect(screen.getByText("Only the custodian can transfer")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Transfer custody" })).toBeNull();

    // Mine (the newest case, registered by the connected wallet): transfer is offered.
    await userEvent.click(within(screen.getByRole("heading", { name: "Cases" }).closest("section")).getAllByRole("button")[0]);
    await userEvent.click(await screen.findByRole("button", { name: "Transfer custody" }));
    const select = await screen.findByLabelText("Transfer custody to");
    await waitFor(() => expect(within(select).getAllByRole("option").length).toBeGreaterThan(1));
    expect(within(select).queryByRole("option", { name: ACCOUNT })).toBeNull(); // not to yourself

    await userEvent.selectOptions(select, OTHER_INVESTIGATOR);
    await userEvent.click(screen.getByRole("button", { name: "Confirm and sign" }));
    await screen.findByText(/Included in block/);

    expect(store.evidence.at(-1).custodian).toBe(OTHER_INVESTIGATOR);
    await waitFor(() => expect(screen.getByText("Only the custodian can transfer")).toBeTruthy());
  });

  it("exports the selected case as a JSON record", async () => {
    renderWithDemo(<CaseDashboard />, { store: seeded() });
    await loaded();

    await userEvent.click(screen.getByRole("button", { name: "Export case record (JSON)" }));

    expect(downloadJson).toHaveBeenCalledTimes(1);
    const [filename, data] = downloadJson.mock.calls[0];
    expect(filename).toMatch(/^case-record-[A-Za-z0-9_-]+\.json$/);
    expect(data.format).toBe("forensics-locker/case-record/v1");
    expect(data.source.mode).toBe("demo");
    expect(data.source.note).toMatch(/DEMO DATA/);
    expect(data.evidence.length).toBeGreaterThan(0);
    expect(data.evidence[0].custody[0].action).toBe("Submitted");
  });
});
