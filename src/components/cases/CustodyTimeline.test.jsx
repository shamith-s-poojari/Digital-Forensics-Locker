// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { computeNoteHash } from "../../custody/custodyNote.js";
import CustodyTimeline from "./CustodyTimeline";

const ACTOR = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const fields = { evidenceId: 3, author: ACTOR, note: "Opened the sealed bag", salt: "ab".repeat(32) };
const stored = { ...fields, noteHash: computeNoteHash(fields) };

const entry = { index: 0, action: "Accessed", actor: ACTOR, counterparty: null, timestamp: 1_790_000_000, noteHash: stored.noteHash };
const record = { id: 3, custodian: ACTOR, cid: "bafy", custodyHead: "ef".repeat(32), custody: [entry] };

const renderTimeline = (notes) => render(<CustodyTimeline record={record} account={ACTOR} chainStatus="intact" config={{}} notes={notes} />);

afterEach(cleanup);

describe("CustodyTimeline: custody notes", () => {
  it("shows a note that reproduces the hash on chain", () => {
    renderTimeline([stored]);
    expect(screen.getByText("Opened the sealed bag")).toBeTruthy();
    expect(screen.getByText(/Matches the hash on the ledger/)).toBeTruthy();
  });

  it("warns about a stored note changed behind the API's back, and does not show its text", () => {
    renderTimeline([{ ...stored, note: "Nothing happened" }]);
    expect(screen.getByText(/NOTE CHANGED/)).toBeTruthy();
    expect(screen.queryByText("Nothing happened")).toBeNull();
  });

  it("falls back to the hash when the text cannot be read", () => {
    renderTimeline(null);
    expect(screen.getByText(/text not available to you/)).toBeTruthy();
  });

  it("shows nothing for an entry with no note", () => {
    render(<CustodyTimeline record={{ ...record, custody: [{ ...entry, noteHash: null }] }} account={ACTOR} chainStatus="intact" config={{}} notes={[stored]} />);
    expect(screen.queryByText(/Note hash|Matches the hash|NOTE CHANGED/)).toBeNull();
  });
});
