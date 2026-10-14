// Archives for `vlx package --archive`: a .tar.gz (Linux) and a .zip (Windows), written here with Node's own zlib so nothing has to be installed, and written the same every time (no clock, no owner)
// so the same files make the same bytes and a checksum means something.
import { createHash } from "node:crypto";
import { deflateRawSync, gzipSync, crc32 } from "node:zlib";

export interface Entry {
  /** Path inside the archive, `/` separated, no leading slash. */
  readonly path: string;
  readonly data: Buffer;
  /** Unix permission bits (0o755 for a program, 0o644 for data). */
  readonly mode: number;
}

const octal = (value: number, width: number): string => value.toString(8).padStart(width - 1, "0") + "\0";

/** One ustar header (512 bytes). A path longer than 100 bytes is split at a `/` into prefix and name, as ustar does. */
const tarHeader = (path: string, size: number, mode: number): Buffer => {
  const bytes = Buffer.byteLength(path);
  let name = path;
  let prefix = "";

  if (bytes > 100) {
    const cut = path.lastIndexOf("/", path.length - 1);
    const split = path.slice(0, cut);
    const rest = path.slice(cut + 1);

    if (cut < 0 || Buffer.byteLength(rest) > 100 || Buffer.byteLength(split) > 155) {
      throw new Error(`the path is too long for an archive: ${path}`);
    }

    prefix = split;
    name = rest;
  }

  const header = Buffer.alloc(512);

  header.write(name, 0, "utf8");
  header.write(octal(mode & 0o777, 8), 100, "ascii");
  header.write(octal(0, 8), 108, "ascii"); // uid
  header.write(octal(0, 8), 116, "ascii"); // gid
  header.write(octal(size, 12), 124, "ascii");
  header.write(octal(0, 12), 136, "ascii"); // mtime: the epoch, so the same files are the same bytes
  header.write("        ", 148, "ascii"); // the checksum is summed over this field as spaces
  header.write("0", 156, "ascii"); // a regular file
  header.write("ustar\0" + "00", 257, "ascii");
  header.write(prefix, 345, "utf8");

  const sum = header.reduce((total, byte) => total + byte, 0);

  header.write(octal(sum, 7) + " ", 148, "ascii");

  return header;
};

/** A gzipped tar of `entries`, in the order given. */
export const tarGz = (entries: ReadonlyArray<Entry>): Buffer => {
  const parts: Array<Buffer> = [];

  for (const entry of entries) {
    parts.push(tarHeader(entry.path, entry.data.length, entry.mode), entry.data, Buffer.alloc((512 - (entry.data.length % 512)) % 512));
  }

  parts.push(Buffer.alloc(1024)); // two empty blocks end an archive

  return gzipSync(Buffer.concat(parts), { level: 9, mtime: 0 } as never);
};

const DOS_TIME = 0; // 00:00:00
const DOS_DATE = (1 << 5) | 1; // 1980-01-01, the earliest a zip can say

/** A zip of `entries` (deflated), with each entry's Unix mode kept so a program stays executable where the unzipper honors it. */
export const zip = (entries: ReadonlyArray<Entry>): Buffer => {
  const local: Array<Buffer> = [];
  const central: Array<Buffer> = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.path, "utf8");
    const packed = deflateRawSync(entry.data, { level: 9 });
    const crc = crc32(entry.data);
    const head = Buffer.alloc(30);

    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4); // version needed
    head.writeUInt16LE(0x0800, 6); // names are UTF-8
    head.writeUInt16LE(8, 8); // deflate
    head.writeUInt16LE(DOS_TIME, 10);
    head.writeUInt16LE(DOS_DATE, 12);
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(packed.length, 18);
    head.writeUInt32LE(entry.data.length, 22);
    head.writeUInt16LE(name.length, 26);
    head.writeUInt16LE(0, 28);
    local.push(head, name, packed);

    const entryCentral = Buffer.alloc(46);

    entryCentral.writeUInt32LE(0x02014b50, 0);
    entryCentral.writeUInt16LE((3 << 8) | 20, 4); // made by Unix, version 2.0
    entryCentral.writeUInt16LE(20, 6);
    entryCentral.writeUInt16LE(0x0800, 8);
    entryCentral.writeUInt16LE(8, 10);
    entryCentral.writeUInt16LE(DOS_TIME, 12);
    entryCentral.writeUInt16LE(DOS_DATE, 14);
    entryCentral.writeUInt32LE(crc, 16);
    entryCentral.writeUInt32LE(packed.length, 20);
    entryCentral.writeUInt32LE(entry.data.length, 24);
    entryCentral.writeUInt16LE(name.length, 28);
    entryCentral.writeUInt32LE(((0o100000 | (entry.mode & 0o777)) << 16) >>> 0, 38); // external attributes: a Unix regular file and its mode
    entryCentral.writeUInt32LE(offset, 42);
    central.push(entryCentral, name);
    offset += head.length + name.length + packed.length;
  }

  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);

  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...local, directory, end]);
};

/** `sha256sum`'s format: the hex digest, two spaces, the file name; one line per file. */
export const checksums = (files: ReadonlyArray<{ readonly name: string; readonly data: Buffer }>): string =>
  files.map((file) => `${createHash("sha256").update(file.data).digest("hex")}  ${file.name}\n`).join("");
