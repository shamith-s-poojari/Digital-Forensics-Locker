import { describe, expect, it } from "vitest";
import { deriveCaseRef } from "../web3/format.js";
import { computeCaseDigest } from "./caseDigest.js";
import { createDemoCaseStore } from "./caseStores.js";
import { SAMPLE_CASE_DIGESTS, SAMPLE_CASES } from "./sampleCases.js";

const EDITOR = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const recompute = (entry, v) => computeCaseDigest({ caseRef: entry.caseRef, caseNumber: entry.caseNumber, title: v.title, description: v.description, salt: v.salt });

describe("caseDigest", () => {
  const base = { caseRef: deriveCaseRef("CASE-1"), caseNumber: "CASE-1", title: "Phishing report", description: "Finance team", salt: "ab".repeat(32) };

  it("is 64 lowercase hex characters and deterministic", () => {
    expect(computeCaseDigest(base)).toMatch(/^[0-9a-f]{64}$/);
    expect(computeCaseDigest(base)).toBe(computeCaseDigest({ ...base }));
  });

  it("ignores surrounding whitespace, case-number case and Unicode normal form", () => {
    expect(computeCaseDigest({ ...base, caseNumber: " case-1 ", title: "  Phishing report\n" })).toBe(computeCaseDigest(base));
    expect(computeCaseDigest({ ...base, title: "Café" })).toBe(computeCaseDigest({ ...base, title: "Café" }));
  });

  it("changes with every field and with the salt", () => {
    const d = computeCaseDigest(base);
    for (const change of [{ title: "Phishing report 2" }, { description: "" }, { caseNumber: "CASE-2" }, { caseRef: deriveCaseRef("CASE-2") }, { salt: "cd".repeat(32) }]) {
      expect(computeCaseDigest({ ...base, ...change })).not.toBe(d);
    }
  });

  it("keeps field boundaries unambiguous", () => {
    expect(computeCaseDigest({ ...base, title: "ab", description: "c" })).not.toBe(computeCaseDigest({ ...base, title: "a", description: "bc" }));
  });

  it("refuses a missing or malformed salt", () => {
    expect(() => computeCaseDigest({ ...base, salt: undefined })).toThrow(/salt/);
    expect(() => computeCaseDigest({ ...base, salt: "AB".repeat(32) })).toThrow(/salt/);
    expect(() => computeCaseDigest({ ...base, salt: "ab".repeat(31) })).toThrow(/salt/);
  });
});

describe("createDemoCaseStore", () => {
  it("is seeded with the sample cases, whose digests the demo ledger anchors", async () => {
    const cases = await createDemoCaseStore().list();
    expect(cases.map((c) => c.caseNumber).sort()).toEqual(SAMPLE_CASES.map((c) => c.caseNumber).sort());
    for (const c of cases) expect(recompute(c, c.versions[0])).toBe(SAMPLE_CASE_DIGESTS[c.caseRef]);
  });

  it("creates version 1 under the normalised case number, with a random salt and the editor", async () => {
    const store = createDemoCaseStore({ seed: false });
    const created = await store.create({ caseNumber: " case-7 ", title: " Title ", description: "Desc" }, EDITOR);
    expect(created).toMatchObject({ caseRef: deriveCaseRef("CASE-7"), caseNumber: "CASE-7", createdBy: EDITOR });
    expect(created.versions).toHaveLength(1);
    const [v1] = created.versions;
    expect(v1).toMatchObject({ version: 1, title: "Title", description: "Desc", editedBy: EDITOR });
    expect(v1.salt).toMatch(/^[0-9a-f]{64}$/);
    expect(v1.digest).toBe(recompute(created, v1));
  });

  it("refuses a missing title or case number, and a case that already exists", async () => {
    const store = createDemoCaseStore({ seed: false });
    await expect(store.create({ caseNumber: "CASE-7", title: "  " })).rejects.toThrow(/title is required/);
    await expect(store.create({ caseNumber: " ", title: "T" })).rejects.toThrow(/case number is required/);
    await store.create({ caseNumber: "CASE-7", title: "T" });
    await expect(store.create({ caseNumber: "case-7", title: "Other" })).rejects.toThrow(/already exists/);
  });

  it("appends a version for an edit and never changes an earlier one", async () => {
    const store = createDemoCaseStore({ seed: false });
    const { caseRef, versions: [v1] } = await store.create({ caseNumber: "CASE-7", title: "First" });
    const edited = await store.addVersion(caseRef, { title: "Second", description: "More" }, EDITOR);
    expect(edited.versions.map((v) => v.version)).toEqual([1, 2]);
    expect(edited.versions[0]).toEqual(v1);
    expect(edited.versions[1]).toMatchObject({ title: "Second", description: "More", editedBy: EDITOR });
    expect(edited.versions[1].salt).not.toBe(v1.salt); // a fresh salt per version
    expect(edited.versions[1].digest).toBe(recompute(edited, edited.versions[1]));
  });

  it("adds nothing for an unchanged edit, and refuses an unknown case", async () => {
    const store = createDemoCaseStore({ seed: false });
    const { caseRef } = await store.create({ caseNumber: "CASE-7", title: "Same", description: "Same" });
    expect((await store.addVersion(caseRef, { title: " Same ", description: "Same" })).versions).toHaveLength(1);
    await expect(store.addVersion(deriveCaseRef("CASE-404"), { title: "T" })).rejects.toThrow(/No such case/);
  });

  it("returns copies, so a caller cannot rewrite the stored history", async () => {
    const store = createDemoCaseStore({ seed: false });
    const created = await store.create({ caseNumber: "CASE-7", title: "Original" });
    created.versions[0].title = "Changed by the caller";
    (await store.list())[0].versions[0].title = "Changed again";
    expect((await store.list())[0].versions[0].title).toBe("Original");
  });
});
