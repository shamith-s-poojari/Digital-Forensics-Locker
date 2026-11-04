import { describe, expect, it } from "vitest";
import { computeNoteHash, matchNote } from "./custodyNote.js";
import { createDemoCustodyNoteStore } from "./custodyNoteStores.js";

const ALICE = "0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A";
const BOB = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const SALT = "ab".repeat(32);

const stored = (fields = {}) => {
  const note = { evidenceId: 7, author: ALICE, note: "Opened the sealed bag", salt: SALT, ...fields };
  return { ...note, noteHash: computeNoteHash(note) };
};
const entryFor = (note, actor = ALICE) => ({ noteHash: note.noteHash, actor });

describe("computeNoteHash", () => {
  it("is stable across spacing, Unicode form and address case", () => {
    const hash = computeNoteHash({ evidenceId: 7, author: ALICE, note: "Café", salt: SALT });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(computeNoteHash({ evidenceId: 7, author: ALICE.toLowerCase(), note: "  Café ", salt: SALT })).toBe(hash);
  });

  it("changes with every field", () => {
    const hash = computeNoteHash(stored());
    expect(computeNoteHash(stored({ evidenceId: 8 }))).not.toBe(hash);
    expect(computeNoteHash(stored({ author: BOB }))).not.toBe(hash);
    expect(computeNoteHash(stored({ note: "Other" }))).not.toBe(hash);
    expect(computeNoteHash(stored({ salt: "cd".repeat(32) }))).not.toBe(hash);
  });

  it("refuses a malformed salt", () => {
    expect(() => computeNoteHash(stored({ salt: "short" }))).toThrow(TypeError);
  });
});

describe("matchNote", () => {
  it("verifies a stored note that reproduces the hash on chain", () => {
    const note = stored();
    expect(matchNote(entryFor(note), 7, [note])).toEqual({ status: "verified", note });
    expect(matchNote(entryFor(note, ALICE.toLowerCase()), 7, [note]).status).toBe("verified");
  });

  it("has nothing to show for an entry with no note", () => {
    expect(matchNote({ noteHash: null, actor: ALICE }, 7, [stored()])).toEqual({ status: "none" });
  });

  it("reports a note it cannot read or find as unavailable", () => {
    const note = stored();
    expect(matchNote(entryFor(note), 7, null).status).toBe("unavailable");
    expect(matchNote(entryFor(note), 7, []).status).toBe("unavailable");
  });

  it("reports text, salt or evidence changed behind the API's back", () => {
    const note = stored();
    expect(matchNote(entryFor(note), 7, [{ ...note, note: "Rewritten" }]).status).toBe("altered");
    expect(matchNote(entryFor(note), 7, [{ ...note, salt: "cd".repeat(32) }]).status).toBe("altered");
    expect(matchNote(entryFor(note), 7, [{ ...note, salt: "bad" }]).status).toBe("altered");
    expect(matchNote(entryFor(note), 8, [note]).status).toBe("altered");
  });

  it("reports a note whose author is not who made the entry", () => {
    const note = stored();
    expect(matchNote(entryFor(note, BOB), 7, [note]).status).toBe("altered");
  });
});

describe("createDemoCustodyNoteStore", () => {
  it("stores notes per evidence item, with hashes that verify", async () => {
    const store = createDemoCustodyNoteStore();
    const note = await store.add({ evidenceId: 7, note: " Checked " }, ALICE);
    await store.add({ evidenceId: 8, note: "Other" }, ALICE);

    expect(note.note).toBe("Checked");
    expect(await store.list(7)).toEqual([note]);
    expect(matchNote(entryFor(note), 7, await store.list(7)).status).toBe("verified");
    await expect(store.add({ evidenceId: 7, note: "  " }, ALICE)).rejects.toThrow(/empty/);
  });
});
