import { describe, expect, it } from "vitest";
import { detectFileType } from "./fileType.js";

const bytes = (...parts) => new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));

describe("detectFileType", () => {
  it.each([
    ["jpg", bytes([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10], "JFIF")],
    ["png", bytes([0x89], "PNG", [0x0d, 0x0a, 0x1a, 0x0a])],
    ["pdf", bytes("%PDF-1.7")],
    ["gif", bytes("GIF89a")],
    ["webp", bytes("RIFF", [0, 0, 0, 0], "WEBP")],
    ["wav", bytes("RIFF", [0, 0, 0, 0], "WAVE")],
    ["mp4", bytes([0, 0, 0, 0x20], "ftypisom")],
    ["mov", bytes([0, 0, 0, 0x14], "ftypqt  ")],
    ["docx", bytes("PK", [3, 4], "....word/document.xml")],
    ["xlsx", bytes("PK", [3, 4], "....xl/workbook.xml")],
    ["zip", bytes("PK", [3, 4], "....photo.jpg")],
    ["E01", bytes("EVF", [0x09, 0x0d, 0x0a, 0xff, 0x00])],
    ["txt", bytes("Suspect called at 21:04 from an unknown number.\n")],
    ["bin", bytes([0x00, 0x01, 0x02, 0xfe])],
    ["bin", new Uint8Array()],
  ])("recognises %s", (ext, data) => {
    expect(detectFileType(data).ext).toBe(ext);
  });

  it("gives a MIME type the OS can use", () => {
    expect(detectFileType(bytes([0xff, 0xd8, 0xff]))).toEqual({ ext: "jpg", mime: "image/jpeg" });
  });
});
