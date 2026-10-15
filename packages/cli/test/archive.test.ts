// The archives `vlx package --archive` writes: read back with readers written here from the formats' own descriptions (and with the system's `tar` where there is one), so a reader that
// is lenient in the same way as the writer cannot pass them.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32 as nodeCrc32, gunzipSync, inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import type { Entry } from "../src/archive.js";
import { checksums, crc32, tarGz, zip } from "../src/archive.js";

const entries: ReadonlyArray<Entry> = [
  { path: "Notes-linux-x64/Notes", data: Buffer.from("#!/bin/sh\necho window\n"), mode: 0o755 },
  { path: "Notes-linux-x64/vlx-engine", data: Buffer.alloc(100_000, 7), mode: 0o755 },
  { path: "Notes-linux-x64/public/logo.svg", data: Buffer.from("<svg/>"), mode: 0o644 },
  { path: "Notes-linux-x64/public/empty.txt", data: Buffer.alloc(0), mode: 0o644 },
  { path: `Notes-linux-x64/public/${"deep/".repeat(20)}file-with-a-longer-name.txt`, data: Buffer.from("deep"), mode: 0o644 },
];

/** The entries of a tar, by its own format: 512-byte headers, the size in octal, the data padded to 512. */
const untar = (tar: Buffer): ReadonlyArray<Entry> => {
  const read: Array<Entry> = [];

  for (let at = 0; at + 512 <= tar.length && tar[at] !== 0;) {
    const header = tar.subarray(at, at + 512);
    const text = (from: number, to: number): string => header.subarray(from, to).toString("utf8").replace(/\0.*$/s, "");
    const size = parseInt(text(124, 136), 8);
    const sum = header.reduce((total, byte, index) => total + (index >= 148 && index < 156 ? 32 : byte), 0);

    expect(parseInt(text(148, 156), 8), "the header's own checksum").toBe(sum);
    read.push({
      path: [text(345, 500), text(0, 100)].filter((part) => part !== "").join("/"),
      data: Buffer.from(tar.subarray(at + 512, at + 512 + size)),
      mode: parseInt(text(100, 108), 8),
    });
    at += 512 + Math.ceil(size / 512) * 512;
  }

  return read;
};

/** The entries of a zip, read from its central directory, each one's CRC checked. */
const unzip = (zipped: Buffer): ReadonlyArray<Entry> => {
  const end = zipped.length - 22;

  expect(zipped.readUInt32LE(end)).toBe(0x06054b50);

  const count = zipped.readUInt16LE(end + 10);
  const read: Array<Entry> = [];
  let at = zipped.readUInt32LE(end + 16);

  for (let index = 0; index < count; index += 1) {
    expect(zipped.readUInt32LE(at)).toBe(0x02014b50);

    const method = zipped.readUInt16LE(at + 10);
    const crc = zipped.readUInt32LE(at + 16);
    const packed = zipped.readUInt32LE(at + 20);
    const nameLength = zipped.readUInt16LE(at + 28);
    const attributes = zipped.readUInt32LE(at + 38) >>> 16;
    const local = zipped.readUInt32LE(at + 42);
    const name = zipped.subarray(at + 46, at + 46 + nameLength).toString("utf8");
    const data = zipped.subarray(
      local + 30 + zipped.readUInt16LE(local + 26) + zipped.readUInt16LE(local + 28),
      local + 30 + zipped.readUInt16LE(local + 26) + zipped.readUInt16LE(local + 28) + packed,
    );
    const inflated = method === 8 ? inflateRawSync(data) : data;

    expect(nodeCrc32(inflated), name).toBe(crc);
    read.push({ path: name, data: inflated, mode: attributes & 0o777 });
    at += 46 + nameLength;
  }

  return read;
};

describe("a .tar.gz", () => {
  it("holds every file, with its mode, and long paths and empty files too", () => {
    expect(untar(gunzipSync(tarGz(entries)))).toEqual(entries);
  });

  it.skipIf(process.platform === "win32")("is read by the system's tar", () => {
    const file = join(mkdtempSync(join(tmpdir(), "vlx-archive-")), "a.tar.gz");

    writeFileSync(file, tarGz(entries));

    const listed = execFileSync("tar", ["-tzvf", file]).toString();

    expect(listed).toContain("-rwxr-xr-x");
    expect(listed).toContain("Notes-linux-x64/public/logo.svg");
    expect(listed).toContain("file-with-a-longer-name.txt");
  });
});

describe("a .zip", () => {
  it("holds every file, with its mode, checked by its CRC", () => {
    expect(unzip(zip(entries))).toEqual(entries);
  });
});

describe("the CRC", () => {
  it("is the standard CRC-32 (the check value of '123456789' is cbf43926), and Node's where Node has one", () => {
    expect(crc32(Buffer.from("123456789")).toString(16)).toBe("cbf43926");
    expect(crc32(Buffer.alloc(0))).toBe(0);
    expect(crc32(Buffer.alloc(100_000, 7))).toBe(nodeCrc32(Buffer.alloc(100_000, 7)));
  });
});

describe("both", () => {
  it("are the same bytes for the same files: nothing in them is a clock or a person", () => {
    expect(tarGz(entries).equals(tarGz(entries))).toBe(true);
    expect(zip(entries).equals(zip(entries))).toBe(true);
  });

  it("have a checksum in `sha256sum`'s format", () => {
    expect(checksums([{ name: "a.zip", data: Buffer.from("abc") }])).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  a.zip\n");
  });
});
