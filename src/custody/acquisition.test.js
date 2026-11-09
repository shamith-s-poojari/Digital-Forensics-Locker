import { describe, expect, it } from "vitest";
import { acquisitionNote, checkAcquisition } from "./acquisition.js";

const H = "ab".repeat(32);
const base = { seizedAt: "2026-11-01T10:30", seizedWhere: "Phone, HQ, Officer Rao", fileHash: `0x${H}`, now: Date.parse("2026-11-07T00:00:00Z") };

describe("acquisition record", () => {
  it("requires when and where", () => {
    expect(checkAcquisition({ ...base, seizedAt: "" }).error).toMatch(/when/);
    expect(checkAcquisition({ ...base, seizedWhere: " " }).error).toMatch(/where/);
    expect(checkAcquisition({ ...base, seizedAt: "2027-01-01T00:00" }).error).toMatch(/future/);
  });

  it("refuses a file whose hash differs from the hash taken at seizure", () => {
    expect(checkAcquisition({ ...base, acquisitionHash: "cd".repeat(32) }).error).toMatch(/changed since seizure/);
    expect(checkAcquisition({ ...base, acquisitionHash: "xyz" }).error).toMatch(/64 hexadecimal/);
    expect(checkAcquisition({ ...base, acquisitionHash: H.toUpperCase() }).error).toBeNull();
  });

  it("writes a note that states the gap between seizure and registration", () => {
    const { record } = checkAcquisition({ ...base, acquisitionHash: H });
    const note = acquisitionNote({ ...record, registeredAt: record.seizedAtMs + 26 * 3_600_000 });
    expect(note).toMatch(/^ACQUISITION RECORD/);
    expect(note).toContain("unchanged since seizure");
    expect(note).toContain("Registered 26 h 0 min after seizure.");
  });
});
